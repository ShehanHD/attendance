# MJML Email Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the hand-crafted inline-HTML email in `api/send-summary.ts` with an MJML-compiled template that is visually branded and email-client compatible.

**Architecture:** `mjml` is moved from `devDependencies` to `dependencies` so it is available in the Vercel serverless bundle. `buildHtml()` is replaced by `buildMjmlHtml()` which interpolates employee data into an MJML template string and calls `mjml(template, { validationLevel: 'soft' }).html` at runtime. No other files change.

**Tech Stack:** TypeScript, MJML 4.x, Nodemailer, Vitest

---

## File Map

| File | Change |
|------|--------|
| `package.json` | Move `mjml` → `dependencies`; add `@types/mjml` → `devDependencies` |
| `api/send-summary.ts` | Add `mjml` import; add `buildMjmlHtml()`; remove `buildHtml()`; update call site |
| `api/send-summary.test.ts` | Add two assertions to the "includes HTML body" test; add one new test |

---

## Task 1: Move mjml to runtime dependencies

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Edit package.json**

  Move `"mjml": "^4.18.0"` from `devDependencies` to `dependencies`, and add `"@types/mjml": "^4.7.4"` to `devDependencies`:

  ```json
  "dependencies": {
    ...existing deps...,
    "mjml": "^4.18.0"
  },
  "devDependencies": {
    ...existing devDeps...,
    "@types/mjml": "^4.7.4"
  }
  ```

- [ ] **Step 2: Install**

  ```bash
  npm install
  ```

  Expected: lock file updates, no errors.

- [ ] **Step 3: Verify mjml type import resolves**

  ```bash
  npx tsc --noEmit
  ```

  Expected: 0 errors (if `@types/mjml` is not found on npm, skip that devDep — mjml 4.x ships its own declarations and the install still works).

- [ ] **Step 4: Commit**

  ```bash
  git add package.json package-lock.json
  git commit -m "chore: move mjml to runtime dependencies"
  ```

---

## Task 2: Add failing tests for new email behavior

**Files:**
- Modify: `api/send-summary.test.ts`

- [ ] **Step 1: Add mjml mock at the top of the test file, after the xlsx mock**

  MJML is a pure compiler — we don't mock it (let it run). However we need to ensure the mock for `nodemailer` still intercepts the final HTML. No mock needed for mjml itself.

- [ ] **Step 2: Extend the existing "includes HTML body" test with new assertions**

  Find this test (line 120):
  ```typescript
  it('includes HTML body in email', async () => {
    const res = makeRes()
    await handler(makeReq(), res as unknown as VercelResponse)

    const mail = mockSendMail.mock.calls[0][0]
    expect(mail.html).toContain('March 2026')
    expect(mail.html).toContain('<table')
  })
  ```

  Replace it with:
  ```typescript
  it('includes HTML body in email', async () => {
    const res = makeRes()
    await handler(makeReq(), res as unknown as VercelResponse)

    const mail = mockSendMail.mock.calls[0][0]
    expect(mail.html).toContain('March 2026')
    expect(mail.html).toContain('<table')
    expect(mail.html).toContain('Admin')           // employee name is present
    expect(mail.html).not.toContain('sickRef')     // sick refs not in email body
  })
  ```

- [ ] **Step 3: Add a new test for color-coded values**

  Add after the existing "includes HTML body" test:
  ```typescript
  it('color-codes sick days in red and shows dashes for zero absent hours', async () => {
    mockFindEntries.mockReturnValue({
      toArray: vi.fn().mockResolvedValue([
        { employeeId: 'emp1', date: '2026-03-01', type: 'sick',    hours: 8, sickRef: 'REF-001' },
        { employeeId: 'emp2', date: '2026-03-01', type: 'absent',  hours: 4, sickRef: null },
      ]),
    })
    const res = makeRes()
    await handler(makeReq(), res as unknown as VercelResponse)

    const mail = mockSendMail.mock.calls[0][0]
    expect(mail.html).toContain('#e74c3c')   // red for sick day
    expect(mail.html).toContain('#e67e22')   // orange for absent hours
    expect(mail.html).not.toContain('REF-001') // sick ref not leaked into email
  })
  ```

- [ ] **Step 4: Run tests — expect failures on the new assertions**

  ```bash
  npm run test:run -- api/send-summary.test.ts
  ```

  Expected: the two new assertions in "includes HTML body" and the new "color-codes" test FAIL. All existing tests PASS.

- [ ] **Step 5: Commit the failing tests**

  ```bash
  git add api/send-summary.test.ts
  git commit -m "test: add assertions for MJML email content"
  ```

---

## Task 3: Implement buildMjmlHtml

**Files:**
- Modify: `api/send-summary.ts`

- [ ] **Step 1: Add the mjml import at the top of the file**

  After the existing imports, add:
  ```typescript
  import mjml from 'mjml'
  ```

- [ ] **Step 2: Add buildMjmlHtml function — replace the entire buildHtml function**

  Remove `buildHtml` completely and add `buildMjmlHtml` in its place:

  ```typescript
  function buildMjmlHtml(
    employees: EmployeeDoc[],
    entriesByEmployee: Map<string, EntryDoc[]>,
    month: number,
    year: number
  ): string {
    const monthName = MONTH_NAMES[month - 1]
    const appUrl = process.env.APP_URL ?? ''

    const logoHtml = appUrl
      ? `<mj-image width="120px" src="${appUrl}/LOGO-VCS-variante_colore2.png" align="left" padding="0" />`
      : `<mj-text color="#ffffff" font-size="18px" font-weight="bold" padding="0">VCS</mj-text>`

    const rows = employees.map((emp, i) => {
      const bg = i % 2 === 0 ? '#ffffff' : '#fafafa'
      const empEntries = entriesByEmployee.get(empId(emp)) ?? []
      if (empEntries.length === 0) {
        return `<tr style="background-color:${bg}">
          <td style="padding:8px 10px;border-bottom:1px solid #eeeeee;font-weight:500">${escapeHtml(emp.name)}</td>
          <td colspan="5" style="padding:8px 10px;border-bottom:1px solid #eeeeee;color:#999999">No entries</td>
        </tr>`
      }
      const s = computeSummary(empEntries)
      const fmtAbsent = s.absentHours > 0
        ? `<span style="color:#e67e22;font-weight:bold">${s.absentHours}h</span>`
        : `<span style="color:#999999">&#8212;</span>`
      const fmtVacation = s.vacationDays > 0
        ? `${s.vacationDays}`
        : `<span style="color:#999999">&#8212;</span>`
      const fmtSick = s.sickDays > 0
        ? `<span style="color:#e74c3c;font-weight:bold">${s.sickDays}</span>`
        : `<span style="color:#999999">&#8212;</span>`
      return `<tr style="background-color:${bg}">
        <td style="padding:8px 10px;border-bottom:1px solid #eeeeee;font-weight:500">${escapeHtml(emp.name)}</td>
        <td style="padding:8px 10px;border-bottom:1px solid #eeeeee;text-align:right">${s.hoursWorked}h</td>
        <td style="padding:8px 10px;border-bottom:1px solid #eeeeee;text-align:right">${fmtAbsent}</td>
        <td style="padding:8px 10px;border-bottom:1px solid #eeeeee;text-align:right">${fmtVacation}</td>
        <td style="padding:8px 10px;border-bottom:1px solid #eeeeee;text-align:right">${fmtSick}</td>
        <td style="padding:8px 10px;border-bottom:1px solid #eeeeee;text-align:right">${s.tickets}</td>
      </tr>`
    }).join('\n')

    const thStyle = 'padding:8px 10px;border-bottom:2px solid #1e3a5f;color:#666666;font-size:11px;text-transform:uppercase;font-weight:600'

    const template = `
  <mjml>
    <mj-head>
      <mj-attributes>
        <mj-all font-family="Arial, Helvetica, sans-serif" />
      </mj-attributes>
    </mj-head>
    <mj-body background-color="#f4f4f4">

      <mj-section background-color="#1e3a5f" padding="16px 24px">
        <mj-column vertical-align="middle">
          ${logoHtml}
        </mj-column>
        <mj-column vertical-align="middle">
          <mj-text align="right" color="#ffffff" font-size="16px" font-weight="bold" padding="0">
            ${monthName} ${year}
          </mj-text>
          <mj-text align="right" color="rgba(255,255,255,0.65)" font-size="11px" padding="4px 0 0 0">
            Monthly Report
          </mj-text>
        </mj-column>
      </mj-section>

      <mj-section background-color="#ffffff" padding="0">
        <mj-column padding="0">
          <mj-table font-size="13px" color="#111111" cell-padding="0">
            <tr style="background-color:#f0f4f8">
              <th style="${thStyle};text-align:left">Employee</th>
              <th style="${thStyle};text-align:right">Hours</th>
              <th style="${thStyle};text-align:right">Absent</th>
              <th style="${thStyle};text-align:right">Vacation</th>
              <th style="${thStyle};text-align:right">Sick</th>
              <th style="${thStyle};text-align:right">Tickets</th>
            </tr>
            ${rows}
          </mj-table>
        </mj-column>
      </mj-section>

      <mj-section background-color="#f5f7fa" padding="10px 24px">
        <mj-column>
          <mj-text font-size="11px" color="#aaaaaa" align="center" padding="8px 0">
            Excel report attached &#xB7; Sent automatically
          </mj-text>
        </mj-column>
      </mj-section>

    </mj-body>
  </mjml>`

    return mjml(template, { validationLevel: 'soft' }).html
  }
  ```

- [ ] **Step 3: Update the call site in sendSummary**

  Find this line (around line 191):
  ```typescript
  const html = buildHtml(employeeDocs, entriesByEmployee, month, year)
  ```

  Replace it with:
  ```typescript
  const html = buildMjmlHtml(employeeDocs, entriesByEmployee, month, year)
  ```

- [ ] **Step 4: Run the full test suite**

  ```bash
  npm run test:run -- api/send-summary.test.ts
  ```

  Expected: ALL tests PASS, including the two new assertions and the color-codes test.

  If any test fails, check:
  - `mail.html` contains `'Admin'` → verify `emp.name` is used in row generation
  - `mail.html` does not contain `'sickRef'` → confirm sick refs are not referenced in `buildMjmlHtml`
  - `mail.html` contains `'#e74c3c'` → confirm `fmtSick` logic triggers when `sickDays > 0`

- [ ] **Step 5: Commit**

  ```bash
  git add api/send-summary.ts api/send-summary.test.ts
  git commit -m "feat: replace buildHtml with MJML-compiled email template"
  ```

---

## Task 4: Verify full build

**Files:** none (build check only)

- [ ] **Step 1: Run TypeScript build**

  ```bash
  npm run build
  ```

  Expected: 0 TypeScript errors, build artifacts written to `dist/`.

- [ ] **Step 2: Run full test suite**

  ```bash
  npm run test:run
  ```

  Expected: all tests pass.

- [ ] **Step 3: Final commit (if build surfaced any type fixes)**

  If any TypeScript errors required fixes in step 1, commit them:
  ```bash
  git add -p
  git commit -m "fix: resolve TypeScript errors after mjml import"
  ```

  If no errors, skip this step.
