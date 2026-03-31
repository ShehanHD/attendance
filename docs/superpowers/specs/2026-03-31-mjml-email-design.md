# MJML Email Redesign — Attendance Summary

**Date:** 2026-03-31  
**Status:** Approved  
**File affected:** `api/send-summary.ts`

---

## Goal

Replace the hand-crafted inline-HTML email in `buildHtml()` with an MJML-compiled template that is properly styled, email-client compatible, and visually branded.

---

## Approach

Runtime MJML compilation (Approach 1):
- `mjml(templateString)` is called inside `sendSummary()` at request time
- The full MJML template is built as a TypeScript template literal with employee data already interpolated
- `mjml` moves from `devDependencies` → `dependencies`; `@types/mjml` is added to `devDependencies`

Rationale: this endpoint runs once a month (or on manual POST). Cold-start time is irrelevant. Runtime compilation keeps the code simple and lets MJML handle 100% of email-client compatibility.

---

## Template Structure

```
mj-body
  mj-section  ← Header: VCS logo (left) + "Month Year / Monthly Report" (right), bg #1e3a5f
  mj-section  ← Table: mj-table with thead + dynamically generated tbody rows
  mj-section  ← Footer: "Excel report attached · Sent automatically", bg #f5f7fa
```

### Header logo

- Image: `${APP_URL}/LOGO-VCS-variante_colore2.png`  
  (`APP_URL` env var already exists in `.env.example`)
- Fallback: if `APP_URL` is empty, render a plain text title instead (no broken image icons)
- SVG is not used — email client support for SVG images is unreliable

### Table

- Uses `<mj-table>` (MJML raw table component) inside `<mj-column>`
- `thead` row: background `#f0f4f8`, bottom border `2px solid #1e3a5f`, text color `#666`
- `tbody` rows: alternating white / `#fafafa`
- Employee name: `font-weight: 500`
- Columns: Employee · Hours Worked · Absent Hours · Vacation Days · Sick Days · Tickets

### Color coding rules

| Column | Non-zero value | Zero value |
|--------|---------------|------------|
| Absent Hours | `color: #e67e22` (orange), bold | `—` in `#999` |
| Vacation Days | default | `—` in `#999` |
| Sick Days | `color: #e74c3c` (red), bold | `—` in `#999` |
| Tickets | default | `0` |
| Hours Worked | default | `0h` |

### Sick refs

**Not shown in the email body.** Sick reference codes appear in the Excel attachment only.

### "No entries" row

If an employee has no entries for the month, render a single `colspan` cell: `No entries` in `color: #999`.

---

## Package changes

| Package | Before | After |
|---------|--------|-------|
| `mjml` | `devDependencies` | `dependencies` |
| `@types/mjml` | not present | `devDependencies` |

---

## Code changes

### `api/send-summary.ts`

1. Add import: `import mjml from 'mjml'`
2. Remove `escapeHtml()` — MJML handles HTML escaping via its text components, or we keep it for values injected into `<mj-table>` raw HTML (keep it)
3. Remove `buildHtml()` — replace with `buildMjmlHtml()`:
   - Takes same signature: `(employees, entriesByEmployee, month, year)`
   - Returns `string` (the compiled HTML from `mjml(...).html`)
   - Constructs the full MJML template string with data interpolated
   - Calls `mjml(template, { validationLevel: 'soft' }).html`
4. Update `sendSummary()`: replace `buildHtml(...)` call with `buildMjmlHtml(...)`

No other files change.

---

## Testing

The existing test file `api/send-summary.test.ts` should be checked — if it tests `buildHtml` directly, the reference must be updated to `buildMjmlHtml`. The output HTML should be verified to contain the expected employee names and values.

---

## Out of scope

- Changes to the Excel attachment generation (`buildXlsxBuffer`)
- Changes to recipient logic or cron scheduling
- Any frontend changes
