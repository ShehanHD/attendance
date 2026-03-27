# Excel Export & Monthly Summary Email Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a client-side Excel download button and a Nodemailer-based monthly summary email (manual button + Vercel cron) to the admin Summary page.

**Architecture:** `exportSummaryToExcel()` in a new `src/lib/exportUtils.ts` handles client-side `.xlsx` generation using SheetJS. A new `api/send-summary.ts` Vercel function handles both manual POST triggers and GET cron calls — it fetches data from MongoDB, builds the same Excel file as a buffer, builds an HTML email, and sends via Nodemailer to all admin employees who have an email set. A `vercel.json` cron fires at 08:00 UTC on days 28–31; the endpoint has a last-day-of-month guard so only one email is sent per month.

**Tech Stack:** `xlsx` (SheetJS), `nodemailer`, Vercel Cron, React + TanStack Query, Vitest

---

## File Map

| File | Action | Responsibility |
|---|---|---|
| `src/lib/exportUtils.ts` | Create | `exportSummaryToExcel()` — client-side Excel generation via SheetJS |
| `src/lib/exportUtils.test.ts` | Create | Unit tests for `exportSummaryToExcel()` |
| `api/send-summary.ts` | Create | Vercel function — fetch DB, build xlsx buffer, build HTML, send email |
| `api/send-summary.test.ts` | Create | Unit tests for the email endpoint |
| `src/pages/Summary.tsx` | Modify | Add Download Excel + Send Summary Email buttons to header |
| `vercel.json` | Create | Vercel cron schedule |
| `package.json` | Modify | Add `xlsx`, `nodemailer`, `@types/nodemailer` |

---

### Task 1: Install dependencies

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Install runtime and dev dependencies**

```bash
cd C:\Users\Don\Documents\attendance
npm install xlsx nodemailer
npm install -D @types/nodemailer
```

Expected: packages added to `node_modules`, `package.json` and `package-lock.json` updated. `xlsx` and `nodemailer` appear in `dependencies`; `@types/nodemailer` in `devDependencies`.

- [ ] **Step 2: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: add xlsx and nodemailer dependencies"
```

---

### Task 2: Excel export utility

**Files:**
- Create: `src/lib/exportUtils.ts`
- Create: `src/lib/exportUtils.test.ts`

`exportSummaryToExcel` takes already-loaded employees + entries, computes per-employee totals via the existing `computeSummary()`, builds a worksheet, and triggers a browser file download.

`computeSummary` return shape (from `src/lib/attendanceUtils.ts`):
```ts
{ hoursWorked: number, absentHours: number, vacationDays: number, sickDays: number, tickets: number }
// hoursWorked = present + absent hours combined
// absentHours = absent hours only (subset of hoursWorked)
// tickets     = count of present days
```

- [ ] **Step 1: Write the failing test**

Create `src/lib/exportUtils.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockAoaToSheet = vi.fn().mockReturnValue({ '!ref': 'A1:G3' })
const mockBookNew = vi.fn().mockReturnValue({})
const mockBookAppendSheet = vi.fn()
const mockWriteFile = vi.fn()

vi.mock('xlsx', () => ({
  utils: {
    aoa_to_sheet: mockAoaToSheet,
    book_new: mockBookNew,
    book_append_sheet: mockBookAppendSheet,
  },
  writeFile: mockWriteFile,
}))

import { exportSummaryToExcel } from './exportUtils'
import type { Employee, AttendanceEntry } from './schemas'

const employees: Employee[] = [
  { _id: 'emp1', name: 'Alice', standardHours: 8, isAdmin: false, isActive: true, hasTickets: true },
  { _id: 'emp2', name: 'Bob',   standardHours: 8, isAdmin: true,  isActive: true, hasTickets: true },
]

const entries: AttendanceEntry[] = [
  { _id: 'e1', employeeId: 'emp1', date: '2026-03-01', type: 'present',  hours: 8, sickRef: null },
  { _id: 'e2', employeeId: 'emp1', date: '2026-03-02', type: 'vacation', hours: 0, sickRef: null },
  { _id: 'e3', employeeId: 'emp1', date: '2026-03-03', type: 'sick',     hours: 0, sickRef: 'REF-001' },
  { _id: 'e4', employeeId: 'emp2', date: '2026-03-01', type: 'present',  hours: 8, sickRef: null },
  { _id: 'e5', employeeId: 'emp2', date: '2026-03-02', type: 'absent',   hours: 4, sickRef: null },
]

describe('exportSummaryToExcel', () => {
  beforeEach(() => vi.clearAllMocks())

  it('passes correct headers and row data to aoa_to_sheet', () => {
    exportSummaryToExcel(employees, entries, 3, 2026)

    expect(mockAoaToSheet).toHaveBeenCalledOnce()
    const [data] = mockAoaToSheet.mock.calls[0]

    expect(data[0]).toEqual([
      'Employee', 'Hours Worked', 'Absent Hours', 'Vacation Days', 'Sick Days', 'Sick Refs', 'Tickets',
    ])
    // Alice: 8h worked, 0 absent, 1 vacation, 1 sick (REF-001), 1 ticket
    expect(data[1]).toEqual(['Alice', 8, 0, 1, 1, 'REF-001', 1])
    // Bob: 12h worked (8 present + 4 absent), 4h absent, 0 vacation, 0 sick, 1 ticket
    expect(data[2]).toEqual(['Bob', 12, 4, 0, 0, '', 1])
  })

  it('generates filename with zero-padded month', () => {
    exportSummaryToExcel(employees, entries, 3, 2026)
    expect(mockWriteFile).toHaveBeenCalledWith(expect.anything(), 'summary-2026-03.xlsx')
  })

  it('appends sheet named "Summary" to workbook', () => {
    exportSummaryToExcel(employees, entries, 3, 2026)
    expect(mockBookAppendSheet).toHaveBeenCalledWith(expect.anything(), expect.anything(), 'Summary')
  })

  it('outputs empty string for sick refs when employee has no sick entries', () => {
    const bobOnly = entries.filter(e => e.employeeId === 'emp2')
    exportSummaryToExcel([employees[1]], bobOnly, 3, 2026)
    const [data] = mockAoaToSheet.mock.calls[0]
    expect(data[1][5]).toBe('')
  })

  it('outputs all zeros for employee with no entries', () => {
    exportSummaryToExcel(employees, [], 3, 2026)
    const [data] = mockAoaToSheet.mock.calls[0]
    expect(data[1]).toEqual(['Alice', 0, 0, 0, 0, '', 0])
    expect(data[2]).toEqual(['Bob',   0, 0, 0, 0, '', 0])
  })
})
```

- [ ] **Step 2: Run test to confirm it fails**

```bash
npx vitest run src/lib/exportUtils.test.ts
```

Expected: FAIL — `Cannot find module './exportUtils'`

- [ ] **Step 3: Create `src/lib/exportUtils.ts`**

```typescript
import * as XLSX from 'xlsx'
import { computeSummary } from './attendanceUtils'
import type { AttendanceEntry, Employee } from './schemas'

export function exportSummaryToExcel(
  employees: Employee[],
  allEntries: AttendanceEntry[],
  month: number,
  year: number
): void {
  const monthStr = String(month).padStart(2, '0')
  const filename = `summary-${year}-${monthStr}.xlsx`

  const headers = [
    'Employee', 'Hours Worked', 'Absent Hours', 'Vacation Days', 'Sick Days', 'Sick Refs', 'Tickets',
  ]

  const rows = employees.map(emp => {
    const empEntries = allEntries.filter(e => e.employeeId === emp._id)
    if (empEntries.length === 0) return [emp.name, 0, 0, 0, 0, '', 0]
    const s = computeSummary(empEntries)
    const sickRefs = empEntries
      .filter(e => e.type === 'sick' && e.sickRef && e.sickRef.trim() !== '')
      .map(e => e.sickRef as string)
      .join(', ')
    return [emp.name, s.hoursWorked, s.absentHours, s.vacationDays, s.sickDays, sickRefs, s.tickets]
  })

  const ws = XLSX.utils.aoa_to_sheet([headers, ...rows])
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Summary')
  XLSX.writeFile(wb, filename)
}
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
npx vitest run src/lib/exportUtils.test.ts
```

Expected: 5 tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/exportUtils.ts src/lib/exportUtils.test.ts
git commit -m "feat: add exportSummaryToExcel utility"
```

---

### Task 3: Add Download Excel button to Summary page

**Files:**
- Modify: `src/pages/Summary.tsx`

- [ ] **Step 1: Add import for `exportSummaryToExcel`**

In `src/pages/Summary.tsx`, add this import after the last existing import:

```typescript
import { exportSummaryToExcel } from '@/lib/exportUtils'
```

- [ ] **Step 2: Replace the `<header>` block**

Replace the entire `<header>...</header>` block (currently wrapping the `<h1>` and `Back` button) with:

```tsx
<header className='border-b px-4 sm:px-6 py-3 sm:py-4 flex items-center justify-between gap-3'>
  <h1 className='text-lg sm:text-xl font-semibold'>Summary</h1>
  <div className='flex items-center gap-2'>
    <Button
      variant='outline'
      disabled={!allEntries || allEntries.length === 0}
      onClick={() => exportSummaryToExcel(employees ?? [], allEntries ?? [], month, year)}
    >
      Download Excel
    </Button>
    <Button variant='outline' onClick={() => navigate('/attendance')}>
      Back
    </Button>
  </div>
</header>
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no errors

- [ ] **Step 4: Commit**

```bash
git add src/pages/Summary.tsx
git commit -m "feat: add Download Excel button to Summary page"
```

---

### Task 4: Email API endpoint

**Files:**
- Create: `api/send-summary.ts`
- Create: `api/send-summary.test.ts`

Handles both manual POST (`{ year, month }` body, admin auth required) and Vercel cron GET calls (`x-vercel-cron: 1` header, no auth required — Vercel strips this header from external requests in production). Cron path only sends on the last calendar day of the month.

Recipients = all employees where `isAdmin: true` AND `email` is set (non-null).

The `computeSummary` logic is inlined in this file (cannot import from `src/lib/` in Vercel functions).

- [ ] **Step 1: Write the failing tests**

Create `api/send-summary.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { VercelRequest, VercelResponse } from '@vercel/node'

// ── DB mock ──────────────────────────────────────────────────────────────────
const mockFindEntries = vi.fn()
const mockFindEmployees = vi.fn()

vi.mock('./_db.js', () => ({
  getDb: vi.fn().mockResolvedValue({
    collection: vi.fn((name: string) =>
      name === 'attendance_entries'
        ? { find: mockFindEntries }
        : { find: mockFindEmployees }
    ),
  }),
}))

// ── Auth mock ─────────────────────────────────────────────────────────────────
vi.mock('./_auth.js', () => ({
  requireAuth: vi.fn().mockResolvedValue({ _id: 'admin1', isAdmin: true }),
}))

// ── Nodemailer mock ───────────────────────────────────────────────────────────
const mockSendMail = vi.fn().mockResolvedValue({ messageId: 'test-id' })
vi.mock('nodemailer', () => ({
  default: { createTransport: vi.fn().mockReturnValue({ sendMail: mockSendMail }) },
}))

// ── xlsx mock ─────────────────────────────────────────────────────────────────
vi.mock('xlsx', () => ({
  utils: {
    aoa_to_sheet: vi.fn().mockReturnValue({}),
    book_new: vi.fn().mockReturnValue({}),
    book_append_sheet: vi.fn(),
  },
  write: vi.fn().mockReturnValue(Buffer.from('fake-xlsx')),
}))

import handler from './send-summary'

// ── Helpers ──────────────────────────────────────────────────────────────────
function makeReq(overrides: Partial<VercelRequest> = {}): VercelRequest {
  return { method: 'POST', headers: {}, body: { year: 2026, month: 3 }, ...overrides } as unknown as VercelRequest
}

function makeRes() {
  const json = vi.fn()
  const status = vi.fn().mockReturnValue({ json })
  return { status, json } as unknown as VercelResponse & { status: typeof status; json: typeof json }
}

// ── Fixtures ──────────────────────────────────────────────────────────────────
const adminWithEmail    = { _id: 'emp1', name: 'Admin',    isAdmin: true,  email: 'admin@example.com' }
const regularEmployee   = { _id: 'emp2', name: 'Regular',  isAdmin: false, email: 'user@example.com' }
const adminWithoutEmail = { _id: 'emp3', name: 'NoEmail',  isAdmin: true,  email: null }
const sampleEntries     = [
  { employeeId: 'emp1', date: '2026-03-01', type: 'present',  hours: 8, sickRef: null },
]

beforeEach(() => {
  vi.clearAllMocks()
  process.env.SMTP_HOST = 'smtp.test.com'
  process.env.SMTP_PORT = '587'
  process.env.SMTP_USER = 'test@test.com'
  process.env.SMTP_PASS = 'secret'
  process.env.SMTP_FROM = 'Test <test@test.com>'
  mockFindEntries.mockReturnValue({ toArray: vi.fn().mockResolvedValue(sampleEntries) })
  mockFindEmployees.mockReturnValue({ toArray: vi.fn().mockResolvedValue([adminWithEmail, regularEmployee, adminWithoutEmail]) })
})

afterEach(() => {
  vi.useRealTimers()
})

describe('POST /api/send-summary', () => {
  it('sends email only to admins with email set and returns sent count', async () => {
    const res = makeRes()
    await handler(makeReq(), res as unknown as VercelResponse)

    expect(mockSendMail).toHaveBeenCalledOnce()
    const mail = mockSendMail.mock.calls[0][0]
    expect(mail.to).toEqual(['admin@example.com'])
    expect(res.json).toHaveBeenCalledWith({ sent: 1 })
  })

  it('returns sent: 0 without sending when no admin has an email', async () => {
    mockFindEmployees.mockReturnValue({ toArray: vi.fn().mockResolvedValue([adminWithoutEmail]) })
    const res = makeRes()
    await handler(makeReq(), res as unknown as VercelResponse)

    expect(mockSendMail).not.toHaveBeenCalled()
    expect(res.json).toHaveBeenCalledWith({ sent: 0 })
  })

  it('returns 400 on invalid body', async () => {
    const res = makeRes()
    await handler(makeReq({ body: { year: 'bad', month: 99 } }), res as unknown as VercelResponse)
    expect(res.status).toHaveBeenCalledWith(400)
  })

  it('returns 500 when SMTP config is missing', async () => {
    delete process.env.SMTP_HOST
    const res = makeRes()
    await handler(makeReq(), res as unknown as VercelResponse)
    expect(res.status).toHaveBeenCalledWith(500)
  })

  it('attaches an xlsx file named summary-YYYY-MM.xlsx', async () => {
    const res = makeRes()
    await handler(makeReq(), res as unknown as VercelResponse)

    const mail = mockSendMail.mock.calls[0][0]
    expect(mail.attachments).toHaveLength(1)
    expect(mail.attachments[0].filename).toBe('summary-2026-03.xlsx')
    expect(mail.attachments[0].contentType).toBe(
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    )
  })

  it('includes HTML body in email', async () => {
    const res = makeRes()
    await handler(makeReq(), res as unknown as VercelResponse)

    const mail = mockSendMail.mock.calls[0][0]
    expect(mail.html).toContain('March 2026')
    expect(mail.html).toContain('<table')
  })
})

describe('GET /api/send-summary (cron)', () => {
  it('skips sending when today is not the last day of the month', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 2, 15)) // March 15 — not last day

    const res = makeRes()
    await handler(makeReq({ method: 'GET', body: undefined, headers: { 'x-vercel-cron': '1' } }), res as unknown as VercelResponse)

    expect(mockSendMail).not.toHaveBeenCalled()
    expect(res.json).toHaveBeenCalledWith({ sent: 0, reason: 'not-last-day' })
  })

  it('sends when today is the last day of the month', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 2, 31)) // March 31 — last day

    const res = makeRes()
    await handler(makeReq({ method: 'GET', body: undefined, headers: { 'x-vercel-cron': '1' } }), res as unknown as VercelResponse)

    expect(mockSendMail).toHaveBeenCalledOnce()
    expect(res.json).toHaveBeenCalledWith({ sent: 1 })
  })
})
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
npx vitest run api/send-summary.test.ts
```

Expected: FAIL — `Cannot find module './send-summary'`

- [ ] **Step 3: Create `api/send-summary.ts`**

```typescript
import { z } from 'zod'
import * as XLSX from 'xlsx'
import nodemailer from 'nodemailer'
import type { VercelRequest, VercelResponse } from '@vercel/node'
import { getDb } from './_db.js'
import { requireAuth } from './_auth.js'

// ── Schemas ───────────────────────────────────────────────────────────────────

const BodySchema = z.object({
  year:  z.number().int().min(2000).max(2100),
  month: z.number().int().min(1).max(12),
})

// ── Types ─────────────────────────────────────────────────────────────────────

interface EntryDoc {
  employeeId: string
  type: 'present' | 'absent' | 'vacation' | 'sick'
  hours: number
  sickRef: string | null
}

interface EmployeeDoc {
  _id: { toString(): string } | string
  name: string
  isAdmin: boolean
  email?: string | null
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

function empId(emp: EmployeeDoc): string {
  return typeof emp._id === 'string' ? emp._id : emp._id.toString()
}

function computeSummary(entries: EntryDoc[]) {
  let hoursWorked = 0, absentHours = 0, vacationDays = 0, sickDays = 0, tickets = 0
  for (const e of entries) {
    if (e.type === 'present' || e.type === 'absent') hoursWorked += e.hours
    if (e.type === 'absent')   absentHours += e.hours
    if (e.type === 'vacation') vacationDays++
    if (e.type === 'sick')     sickDays++
    if (e.type === 'present')  tickets++
  }
  return { hoursWorked, absentHours, vacationDays, sickDays, tickets }
}

function isLastDayOfMonth(date: Date): boolean {
  // Check by seeing if tomorrow is day 1
  const tomorrow = new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1)
  return tomorrow.getDate() === 1
}

function buildXlsxBuffer(
  employees: EmployeeDoc[],
  entriesByEmployee: Map<string, EntryDoc[]>
): Buffer {
  const headers = ['Employee', 'Hours Worked', 'Absent Hours', 'Vacation Days', 'Sick Days', 'Sick Refs', 'Tickets']
  const rows = employees.map(emp => {
    const empEntries = entriesByEmployee.get(empId(emp)) ?? []
    if (empEntries.length === 0) return [emp.name, 0, 0, 0, 0, '', 0]
    const s = computeSummary(empEntries)
    const sickRefs = empEntries
      .filter(e => e.type === 'sick' && e.sickRef && e.sickRef.trim() !== '')
      .map(e => e.sickRef as string)
      .join(', ')
    return [emp.name, s.hoursWorked, s.absentHours, s.vacationDays, s.sickDays, sickRefs, s.tickets]
  })
  const ws = XLSX.utils.aoa_to_sheet([headers, ...rows])
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Summary')
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer
}

function buildHtml(
  employees: EmployeeDoc[],
  entriesByEmployee: Map<string, EntryDoc[]>,
  month: number,
  year: number
): string {
  const monthName = MONTH_NAMES[month - 1]
  const tdStyle = 'padding:8px;border:1px solid #ddd'
  const rows = employees.map(emp => {
    const empEntries = entriesByEmployee.get(empId(emp)) ?? []
    if (empEntries.length === 0) {
      return `<tr><td style="${tdStyle}">${emp.name}</td><td colspan="6" style="${tdStyle};color:#888">No entries</td></tr>`
    }
    const s = computeSummary(empEntries)
    const sickRefs = empEntries
      .filter(e => e.type === 'sick' && e.sickRef && e.sickRef.trim() !== '')
      .map(e => e.sickRef as string)
      .join(', ')
    return `<tr>
      <td style="${tdStyle}">${emp.name}</td>
      <td style="${tdStyle};text-align:right">${s.hoursWorked}h</td>
      <td style="${tdStyle};text-align:right">${s.absentHours > 0 ? `${s.absentHours}h` : '—'}</td>
      <td style="${tdStyle};text-align:right">${s.vacationDays}</td>
      <td style="${tdStyle};text-align:right">${s.sickDays}</td>
      <td style="${tdStyle}">${sickRefs || '—'}</td>
      <td style="${tdStyle};text-align:right">${s.tickets}</td>
    </tr>`
  }).join('')

  return `<!DOCTYPE html>
<html>
<body style="font-family:sans-serif;color:#111;margin:24px">
  <h2 style="margin-bottom:16px">Attendance Summary — ${monthName} ${year}</h2>
  <table style="border-collapse:collapse;font-size:14px">
    <thead>
      <tr style="background:#f5f5f5">
        <th style="${tdStyle}">Employee</th>
        <th style="${tdStyle}">Hours Worked</th>
        <th style="${tdStyle}">Absent Hours</th>
        <th style="${tdStyle}">Vacation Days</th>
        <th style="${tdStyle}">Sick Days</th>
        <th style="${tdStyle}">Sick Refs</th>
        <th style="${tdStyle}">Tickets</th>
      </tr>
    </thead>
    <tbody>${rows}</tbody>
  </table>
</body>
</html>`
}

// ── Core send logic ───────────────────────────────────────────────────────────

async function sendSummary(year: number, month: number, res: VercelResponse): Promise<void> {
  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM } = process.env
  if (!SMTP_HOST || !SMTP_PORT || !SMTP_USER || !SMTP_PASS || !SMTP_FROM) {
    res.status(500).json({ error: 'SMTP environment variables not configured' })
    return
  }

  const db = await getDb()
  const monthStr = String(month).padStart(2, '0')

  const [entryDocs, employeeDocs] = await Promise.all([
    db.collection('attendance_entries')
      .find({ date: { $regex: `^${year}-${monthStr}` } })
      .toArray() as Promise<EntryDoc[]>,
    db.collection('employees')
      .find({})
      .toArray() as Promise<EmployeeDoc[]>,
  ])

  const entriesByEmployee = new Map<string, EntryDoc[]>()
  for (const e of entryDocs) {
    const key = e.employeeId
    if (!entriesByEmployee.has(key)) entriesByEmployee.set(key, [])
    entriesByEmployee.get(key)!.push(e)
  }

  const recipients = employeeDocs
    .filter(e => e.isAdmin && e.email)
    .map(e => e.email as string)

  if (recipients.length === 0) {
    res.json({ sent: 0 })
    return
  }

  const xlsxBuffer = buildXlsxBuffer(employeeDocs, entriesByEmployee)
  const html = buildHtml(employeeDocs, entriesByEmployee, month, year)
  const monthName = MONTH_NAMES[month - 1]

  const transporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port: Number(SMTP_PORT),
    secure: Number(SMTP_PORT) === 465,
    auth: { user: SMTP_USER, pass: SMTP_PASS },
  })

  await transporter.sendMail({
    from: SMTP_FROM,
    to: recipients,
    subject: `Attendance Summary — ${monthName} ${year}`,
    html,
    attachments: [{
      filename: `summary-${year}-${monthStr}.xlsx`,
      content: xlsxBuffer,
      contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    }],
  })

  res.json({ sent: recipients.length })
}

// ── Handler ───────────────────────────────────────────────────────────────────

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  const isCron = req.headers['x-vercel-cron'] === '1'

  // Cron or GET: only send on the last day of the month
  if (req.method === 'GET' || isCron) {
    const today = new Date()
    if (!isLastDayOfMonth(today)) {
      res.json({ sent: 0, reason: 'not-last-day' })
      return
    }
    try {
      await sendSummary(today.getFullYear(), today.getMonth() + 1, res)
    } catch {
      res.status(500).json({ error: 'Failed to send summary email' })
    }
    return
  }

  // Manual POST: require admin auth
  if (req.method === 'POST') {
    const auth = await requireAuth(req, res)
    if (!auth) return
    if (!auth.isAdmin) { res.status(403).json({ error: 'Admin access required' }); return }

    const parsed = BodySchema.safeParse(req.body)
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0].message })
      return
    }
    try {
      await sendSummary(parsed.data.year, parsed.data.month, res)
    } catch {
      res.status(500).json({ error: 'Failed to send summary email' })
    }
    return
  }

  res.status(405).json({ error: 'Method not allowed' })
}
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
npx vitest run api/send-summary.test.ts
```

Expected: all 7 tests PASS

- [ ] **Step 5: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no errors

- [ ] **Step 6: Commit**

```bash
git add api/send-summary.ts api/send-summary.test.ts
git commit -m "feat: add send-summary API endpoint with Nodemailer and cron support"
```

---

### Task 5: Add Send Summary Email button to Summary page

**Files:**
- Modify: `src/pages/Summary.tsx`

- [ ] **Step 1: Add `isSending` state**

Inside `Summary()`, after the existing `useState` hooks, add:

```typescript
const [isSending, setIsSending] = useState(false)
```

- [ ] **Step 2: Add `handleSendEmail` function**

Inside `Summary()`, before the `return`, add:

```typescript
async function handleSendEmail() {
  setIsSending(true)
  try {
    const res = await fetch('/api/send-summary', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ year, month }),
    })
    if (!res.ok) {
      const data = await res.json().catch(() => ({})) as { error?: string }
      toast.error((data.error) ?? 'Failed to send summary email')
      return
    }
    const data = await res.json() as { sent: number }
    toast.success(
      data.sent === 0
        ? 'No admin recipients found'
        : `Summary email sent to ${data.sent} admin${data.sent > 1 ? 's' : ''}`
    )
  } catch {
    toast.error('Failed to send summary email')
  } finally {
    setIsSending(false)
  }
}
```

- [ ] **Step 3: Add `toast` import**

Add to the imports at the top of `Summary.tsx`:

```typescript
import { toast } from 'sonner'
```

- [ ] **Step 4: Add the Send Email button to the header**

Replace the `<header>` block (set in Task 3) with:

```tsx
<header className='border-b px-4 sm:px-6 py-3 sm:py-4 flex items-center justify-between gap-3'>
  <h1 className='text-lg sm:text-xl font-semibold'>Summary</h1>
  <div className='flex items-center gap-2'>
    <Button
      variant='outline'
      disabled={!allEntries || allEntries.length === 0}
      onClick={() => exportSummaryToExcel(employees ?? [], allEntries ?? [], month, year)}
    >
      Download Excel
    </Button>
    <Button
      variant='outline'
      disabled={isSending}
      onClick={handleSendEmail}
    >
      {isSending ? 'Sending…' : 'Send Summary Email'}
    </Button>
    <Button variant='outline' onClick={() => navigate('/attendance')}>
      Back
    </Button>
  </div>
</header>
```

- [ ] **Step 5: Verify TypeScript compiles and all tests pass**

```bash
npx tsc --noEmit && npx vitest run
```

Expected: no TS errors, all tests PASS

- [ ] **Step 6: Commit**

```bash
git add src/pages/Summary.tsx
git commit -m "feat: add Send Summary Email button to Summary page"
```

---

### Task 6: Vercel cron config

**Files:**
- Create: `vercel.json`

- [ ] **Step 1: Create `vercel.json`**

```json
{
  "crons": [
    {
      "path": "/api/send-summary",
      "schedule": "0 8 28-31 * *"
    }
  ]
}
```

> This fires at 08:00 UTC on days 28, 29, 30, 31. The `isLastDayOfMonth` guard in `api/send-summary.ts` ensures only the actual last day of the month results in an email.

- [ ] **Step 2: Run full build**

```bash
npm run build
```

Expected: build succeeds, no errors

- [ ] **Step 3: Commit**

```bash
git add vercel.json
git commit -m "chore: add Vercel cron for end-of-month summary email"
```

---

## Environment Variables

Set these in Vercel project settings → Environment Variables (and in `.env.local` for local `vercel dev`):

```
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your@gmail.com
SMTP_PASS=your-app-password
SMTP_FROM=Attendance <your@gmail.com>
```

For Gmail: generate an App Password at Google Account → Security → App Passwords (requires 2-Step Verification to be enabled).
