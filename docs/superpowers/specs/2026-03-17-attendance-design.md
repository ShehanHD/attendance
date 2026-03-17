# Workers Attendance App — Design Spec
**Date:** 2026-03-17
**Status:** Approved

---

## 1. Overview

A standalone static web app for tracking worker attendance. No backend server — data is stored in MongoDB Atlas, accessed directly from the frontend via the Atlas Data API. Deployed as static files (e.g. Nginx, Netlify).

**User flow:**
1. User opens the app → selects themselves from an employee dropdown
2. Regular employee → monthly attendance grid (their own data only)
3. Admin employee → same attendance grid + a link to an all-employees summary page

There is no authentication. Employees are predefined in the database by an admin. Company closures and employee configuration are managed directly in the database — no UI for these.

---

## 2. Stack

- **React 18 + TypeScript + Vite** — frontend framework
- **shadcn/ui + Tailwind CSS** — UI components
- **React Router v6** — client-side routing
- **TanStack Query** — data fetching and caching
- **Zod** — runtime validation of all MongoDB responses
- **MongoDB Atlas Data API** — HTTP-based database access (no backend needed)
- `.env` for `VITE_ATLAS_API_KEY`, `VITE_ATLAS_BASE_URL`, `VITE_ATLAS_DATABASE`, `VITE_ATLAS_DATA_SOURCE` (cluster name)

---

## 3. Routes

```
/              → Home: employee selector
/attendance    → Monthly attendance grid (redirects to / if no employee in session)
/summary       → Admin-only all-employees summary (redirects to / if not admin)
```

Selected employee is stored in `sessionStorage` — survives page refresh, clears on tab close.

**Route guards:** Each protected page (`Attendance.tsx`, `Summary.tsx`) implements its own guard using a React Router `<Navigate to="/" replace />` rendered inline at the top of the component — no shared wrapper component. `Attendance.tsx` checks for a valid session employee; `Summary.tsx` additionally checks `employee.isAdmin === true`.

---

## 4. Data Model (MongoDB Collections)

### `employees`
```ts
{
  _id:           string    // MongoDB ObjectId as string
  name:          string
  standardHours: number    // e.g. 8 (full-time), 4 (part-time)
  isAdmin:       boolean
}
```

### `attendance_entries`
```ts
{
  _id:        string    // MongoDB ObjectId as string
  employeeId: string    // references employees._id
  date:       string    // "YYYY-MM-DD" local date
  type:       "present" | "absent" | "vacation" | "sick"
  hours:      number    // 0 for vacation/sick; standardHours or partial for present/absent
  sickRef:    string | null  // required (non-empty) when type = "sick", null otherwise
}
```

### `company_closures`
```ts
{
  _id:  string
  date: string      // "YYYY-MM-DD"
  note: string | null
}
```

**Date handling:** All dates are `YYYY-MM-DD` strings treated as local dates. Always use `new Date(year, month - 1, day)` — never `new Date("YYYY-MM-DD")` which parses as UTC and causes off-by-one errors in non-UTC timezones.

Disabled days (weekends, Italian public holidays, company closures) are never stored as entries.

---

## 5. Component Structure

```
src/
  pages/
    Home.tsx              // Employee selector; stores selection in sessionStorage
    Attendance.tsx        // Monthly grid page; redirects to / if no employee in session
    Summary.tsx           // Admin-only summary; redirects to / if not admin
  components/
    AttendanceGrid.tsx    // Monthly editable grid
    SummaryTable.tsx      // All-employees totals table
    EmployeeSelector.tsx  // Reusable dropdown (used in Home.tsx)
    CellEditor.tsx        // Popover: type dropdown, hours input, sickRef input
  lib/
    mongoApi.ts           // All Atlas Data API call wrappers
    attendanceUtils.ts    // Pure helpers (no React imports)
    schemas.ts            // Zod schemas + inferred TS types
  hooks/
    useAttendance.ts      // TanStack Query hooks for entries (fetch + save)
    useEmployees.ts       // TanStack Query hook for employee list
    useClosures.ts        // TanStack Query hook for company closures
```

---

## 6. API Contract (Atlas Data API)

All calls go through `mongoApi.ts`. Atlas Data API uses `POST /action/find`, `POST /action/deleteMany`, `POST /action/insertMany` for all operations — `mongoApi.ts` abstracts these into logical method names.

| Operation | Atlas action | Description |
|---|---|---|
| Get all employees | `find` on `employees` | Returns `Employee[]` |
| Get entries (employee + month) | `find` on `attendance_entries` | Filter: `{ employeeId: <id>, date: { $regex: "^YYYY-MM" } }` |
| Save entries (employee × month) | `deleteMany` then `insertMany` on `attendance_entries` | Full replace scoped to one employee × month |
| Get all closures | `find` on `company_closures` | Returns `CompanyClosure[]` |
| Get all entries (summary) | `find` on `attendance_entries` | Filter: `{ date: { $regex: "^YYYY-MM" } }`; used by Summary page |

**Save semantics:** The frontend always sends all entries for the displayed employee's month in a single operation — never a partial update. `deleteMany` removes all existing entries for that `employeeId` within the month, then `insertMany` inserts the full payload.

**Error handling:** Zod `.parse()` on every response at the `mongoApi.ts` boundary. Parse failures throw and are caught by TanStack Query.

---

## 7. Zod Schemas (`src/lib/schemas.ts`)

```ts
EmployeeSchema
// z.object({
//   _id:           z.string(),
//   name:          z.string(),
//   standardHours: z.number().positive(),
//   isAdmin:       z.boolean(),
// })

AttendanceEntryTypeSchema
// z.enum(["present", "absent", "vacation", "sick"])

AttendanceEntrySchema
// z.object({
//   _id:        z.string(),
//   employeeId: z.string(),
//   date:       z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
//   type:       AttendanceEntryTypeSchema,
//   hours:      z.number().min(0).max(24),
//   sickRef:    z.string().trim().min(1).max(200).nullable(),
// })
// Note: sickRef conditionality (required when type="sick") is enforced by
// the pre-save UI guard, not by a schema refinement, to avoid rejecting
// valid API responses where type !== "sick" and sickRef is null.

CompanyClosureSchema
// z.object({
//   _id:  z.string(),
//   date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
//   note: z.string().nullable(),
// })
```

Exported TS types: `Employee`, `AttendanceEntry`, `AttendanceEntryType`, `CompanyClosure` — all via `z.infer<typeof ...>`.

---

## 8. `attendanceUtils.ts` (Pure Helpers)

No React imports. All date operations use the integer `Date` constructor.

```ts
// Fixed Italian national holidays ({ month: number; day: number }[], month 1-indexed)
// Includes all fixed-date national holidays. Easter Sunday is always a Sunday (disabled
// as a weekend). Easter Monday (Lunedì dell'Angelo) is a variable-date national holiday
// and is NOT in this array — it is computed dynamically via getEasterDate().
const ITALIAN_PUBLIC_HOLIDAYS: { month: number; day: number }[]

// Easter Sunday for the given year (Anonymous Gregorian algorithm).
// Used to derive Easter Monday: new Date(getEasterDate(year).getTime() + 86400000)
function getEasterDate(year: number): Date

// Returns true if the day is a weekend, Italian public holiday (including Easter Monday), or company closure
function isDisabledDay(year: number, month: number, day: number, closures: CompanyClosure[]): boolean

// Generates present-default entries for non-disabled working days.
// Each generated entry uses: type = "present", hours = employee.standardHours,
// sickRef = null, _id = crypto.randomUUID() (temporary client-side ID, replaced after save).
// Past/current month: caps at today. Future months: returns [].
function buildDefaultEntries(
  employee: Employee,
  month: number,
  year: number,
  closures: CompanyClosure[]
): AttendanceEntry[]

// Computes monthly totals from a set of entries
function computeSummary(entries: AttendanceEntry[]): {
  hoursWorked: number    // sum of hours where type = "present" or "absent"
  vacationDays: number   // count where type = "vacation"
  sickDays: number       // count where type = "sick"
  tickets: number        // count of days where type = "present" (meal vouchers)
}
```

---

## 9. AttendanceGrid Behaviour

- Month/year selector bounded to `[currentYear − 1, currentYear + 1]`
- On mount and on selector change: fetches entries; calls `buildDefaultEntries()` on empty response (subject to future-month rule)
- **`isDirty` flag:** initialised to `false`. Set to `true` only when the user edits a cell via `CellEditor`. Auto-populating the grid via `buildDefaultEntries()` does NOT set `isDirty` — the user must explicitly edit before the dirty guard activates.
- **Dirty navigation guard:** when `isDirty === true` and the user attempts to switch month, change employee, or navigate away, a shadcn `AlertDialog` is shown: *"You have unsaved changes. Leave without saving?"*
  - Confirmed (discard) → `isDirty` set to `false`, navigation proceeds
  - Rejected (stay) → navigation cancelled, grid unchanged
- Disabled cells: greyed out, not interactive (weekends, holidays, closures)
- Future month with no entries → grid shows informational message: *"No entries yet for this month."* No defaults generated.
- Editable cells: click opens `CellEditor` popover:
  - Type dropdown: present / absent / vacation / sick
  - Hours input: hidden when type = vacation or sick
  - Sick ref text input: visible only when type = sick
- Summary row below grid: Hours Worked, Vacation Days, Sick Days, Tickets — recomputed on every `entries` state change via `computeSummary()`
- **Save button:**
  1. Validates: any `type === "sick"` with empty/whitespace `sickRef` → warning toast, save blocked
  2. Asserts all entries have `employeeId === selectedEmployee._id`
  3. Calls Atlas Data API (`deleteMany` then `insertMany`)
  4. Re-fetches entries for the current employee + month from the API to replace local state (ensures server-assigned `_id` values replace temporary UUIDs)
  5. Sets `isDirty = false`

---

## 10. Summary Page (Admin Only)

- Accessible only when `selectedEmployee.isAdmin === true`; otherwise redirects to `/`
- Admin still edits their own attendance on `/attendance` — summary is a separate view
- Month/year selector (same bounds as grid)
- Fetches all entries for all employees for the selected month
- One row per employee showing: name, hours worked, vacation days, sick days, tickets
- Computed via `computeSummary()` per employee
- Read-only — no editing from this view

---

## 11. Error Handling

- Fetch failure → shadcn `Alert` with retry button (via TanStack Query error state)
- Save failure → shadcn `toast` (destructive)
- Save success → shadcn `toast` (success)
- Zod parse failure → thrown, caught by TanStack Query, rendered as error state
- Pre-save: `type === "sick"` with empty `sickRef` → warning toast, blocked
- Dirty navigation guard: switching month/employee/page while `isDirty` → shadcn `AlertDialog` confirmation

---

## 12. Edge Cases

- No entries for a past/current month → `buildDefaultEntries()` generates present-defaults for non-disabled days up to today
- No entries for a future month → grid shows *"No entries yet for this month."* message; no defaults generated
- Employee list empty → informational empty state
- `sessionStorage` cleared → user re-selects on next visit
- Non-admin visits `/summary` → redirected to `/`
- Admin visits `/summary` without session → redirected to `/`

---

## 13. Known Gaps / Future Work

- API key exposed in frontend bundle — accepted trade-off for internal tool on private network
- No audit trail on entries
- Easter covers national holidays; regional Italian holidays not included
- No test runner configured; `attendanceUtils.ts` pure functions are highest-priority candidates for unit tests if added later
