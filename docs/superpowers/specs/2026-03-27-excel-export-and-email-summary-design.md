# Excel Export & Monthly Summary Email — Design Spec
**Date:** 2026-03-27
**Status:** Approved

---

## 1. Overview

Two new features added to the admin Summary page:

1. **Excel Download** — "Download Excel" button exports the current month's summary as a `.xlsx` file, generated client-side.
2. **Monthly Summary Email** — sends an HTML email with the summary table and `.xlsx` attachment to all admin users who have an email set. Triggered both manually (button on Summary page) and automatically (Vercel Cron at end of month).

---

## 2. Feature 1: Excel Download

### Approach
Client-side generation using the `xlsx` (SheetJS) library. No backend involvement.

### New dependency
- `xlsx` — added to `dependencies` (frontend bundle, ~500KB)

### New file: `src/lib/exportUtils.ts`
Pure utility function (no React imports):

```ts
exportSummaryToExcel(
  employees: Employee[],
  allEntries: AttendanceEntry[],
  month: number,
  year: number
): void
```

- Uses existing `computeSummary()` from `attendanceUtils.ts` — no duplication
- Output filename: `summary-YYYY-MM.xlsx`
- Sheet name: `Summary`
- Columns: `Employee | Hours Worked | Absent Hours | Vacation Days | Sick Days | Sick Refs | Tickets`
- One row per employee, same order and data as `SummaryTable`
- Sick Refs column: comma-separated list of refs for employees with sick days

### UI change: `src/pages/Summary.tsx`
- "Download Excel" button added to the page header (next to "Back" button)
- Disabled when `allEntries` is empty
- Calls `exportSummaryToExcel()` directly on click — no async, no loading state

---

## 3. Feature 2: Monthly Summary Email

### New environment variables
```
SMTP_HOST        # e.g. smtp.gmail.com
SMTP_PORT        # e.g. 587
SMTP_USER        # sender account
SMTP_PASS        # app password / SMTP credential
SMTP_FROM        # display name + address, e.g. "Attendance <you@example.com>"
```

### New dependency
- `nodemailer` + `@types/nodemailer` — server-side only (Vercel function)

### New file: `api/send-summary.ts`
Vercel serverless function.

**Auth:** Uses existing `requireAuth` — admin session required. Cron calls are unauthenticated; the endpoint detects cron calls (no session cookie) and bypasses auth only when triggered by the Vercel Cron (detected via `x-vercel-cron` header or absence of body).

**Manual trigger (POST with body):**
```ts
{ year: number, month: number }
```
- Validates body with Zod
- Fetches entries + employees from MongoDB
- Computes per-employee summary via `computeSummary()`
- Generates `.xlsx` buffer using `xlsx` (same columns as Feature 1)
- Builds HTML email table
- Finds recipients: all employees where `isAdmin: true` AND `email` is set
- Sends via Nodemailer with `.xlsx` attached
- Returns `{ sent: number }` (recipient count)

**Cron trigger (GET or no body):**
- Computes current date; proceeds only if today is the last day of the month (guard against the 28–31 schedule firing on non-last days)
- Uses previous logic with `{ year: today.year, month: today.month }`

**Error handling:**
- SMTP config missing → `500` with descriptive error
- No admin recipients found → `200` with `{ sent: 0 }` (not an error)
- Nodemailer failure → `500` with error message

### Email format
- **Subject:** `Attendance Summary — Month YYYY` (e.g. `Attendance Summary — March 2026`)
- **Body:** HTML table with same columns as Summary page
- **Attachment:** `summary-YYYY-MM.xlsx`

### Vercel Cron: `vercel.json`
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
Runs at 08:00 UTC on days 28–31 of every month. The endpoint itself checks if today is the last day of the month before sending — so only one email is sent per month regardless of how many days the cron wakes on.

### UI change: `src/pages/Summary.tsx`
- "Send Summary Email" button added to the page header (alongside "Download Excel" and "Back")
- On click: calls `POST /api/send-summary` with `{ year, month }` from current selector state
- Shows loading spinner while in-flight
- On success: toast showing recipient count (e.g. *"Summary email sent to 2 admins"*)
- On failure: destructive toast with error message

---

## 4. Data Flow

```
Summary page (admin)
  │
  ├── [Download Excel btn] → exportSummaryToExcel() → browser downloads .xlsx
  │                          (uses already-loaded employees + allEntries in React state)
  │
  └── [Send Email btn] ──→ POST /api/send-summary { year, month }
                              │
                              ├── getDb() → fetch entries + employees
                              ├── computeSummary() per employee
                              ├── xlsx.utils → build .xlsx buffer
                              ├── build HTML table
                              ├── find admin recipients (isAdmin + email set)
                              └── nodemailer.sendMail() → SMTP → inbox

Vercel Cron (08:00 UTC, days 28–31)
  └── GET /api/send-summary
        └── check: is today the last day of month?
              ├── yes → same flow as above (auto year/month)
              └── no  → exit silently (200, { sent: 0 })
```

---

## 5. Files Changed / Created

| File | Change |
|---|---|
| `src/lib/exportUtils.ts` | **New** — `exportSummaryToExcel()` |
| `src/pages/Summary.tsx` | Add Download + Send Email buttons |
| `api/send-summary.ts` | **New** — Vercel function |
| `vercel.json` | **New** — cron schedule |
| `package.json` | Add `xlsx`, `nodemailer`, `@types/nodemailer` |

---

## 6. Environment Variables Required

| Variable | Required for |
|---|---|
| `SMTP_HOST` | Email sending |
| `SMTP_PORT` | Email sending |
| `SMTP_USER` | Email sending |
| `SMTP_PASS` | Email sending |
| `SMTP_FROM` | Email from address/name |

---

## 7. Constraints & Notes

- `xlsx` is added to frontend `dependencies` (not devDependencies) — needed at runtime in the browser
- Cron is Vercel-hosted; requires Vercel Pro for custom cron schedules. On free tier, the cron will still run but only once per day — the last-day guard ensures correctness
- The `send-summary` endpoint reuses `computeSummary()` logic. To avoid duplicating it server-side, the shared pure function should be extracted from `src/lib/attendanceUtils.ts` into a file importable by both the frontend and the `api/` functions — or the logic is duplicated inline in the API (acceptable given its simplicity)
- Admin recipients are resolved at send time from the DB — no hardcoded lists
- The Excel file generated client-side (Download button) and server-side (Email attachment) use the same column structure; `exportUtils.ts` logic should be mirrored in the API (or shared via a common utility if the monorepo structure allows)
