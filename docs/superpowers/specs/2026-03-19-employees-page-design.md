# Employees Management Page — Design Spec

**Date:** 2026-03-19
**Status:** Approved

---

## Overview

Add a `/employees` page accessible only to admin users, where they can create, edit, deactivate, and reactivate employees. Follows the same access-control pattern as the existing `/summary` page. The Summary page gains a toggle to show/hide inactive employees for historical data review.

---

## Data Model Changes

### `EmployeeSchema` — add `isActive: boolean`

Add `isActive: z.boolean().default(true)` to `EmployeeSchema` in `src/lib/schemas.ts`.

- All new employees are created with `isActive: true`
- Existing MongoDB documents without the field parse correctly: `z.boolean().default(true)` supplies `true` when the key is absent — this also covers existing `sessionStorage` values serialised before the field was deployed, so no migration or `optional()` weakening is needed
- "Deleting" an employee sets `isActive: false` (soft delete — attendance data is preserved)

### `standardHours` validation

Use `z.number().int().positive()` — whole hours only. The modal validation must match (positive integer, not arbitrary decimal).

---

## API Changes

### Extend `api/employees.ts` — add POST and PUT

The existing file handles `GET /api/employees`. Add method routing for:

**`POST /api/employees`** — Create a new employee
- Body (Zod-validated): `{ name: string, standardHours: number, isAdmin: boolean }`
- Inserts document with `isActive: true`
- Response envelope: `{ employee: Employee }` (with server-assigned `_id`)

**`PUT /api/employees`** — Update an existing employee
- Body (Zod-validated): `{ _id: string, name: string, standardHours: number, isAdmin: boolean, isActive: boolean }`
- Updates all fields including `isActive` (used for deactivate/reactivate)
- Response envelope: `{ employee: Employee }`

**`GET /api/employees`** — unchanged, now also returns `isActive` field.

### `src/lib/mongoApi.ts` additions

- `createEmployee(data)` — POST to `/api/employees`, validates response against `z.object({ employee: EmployeeSchema })`
- `updateEmployee(data)` — PUT to `/api/employees`, validates response against `z.object({ employee: EmployeeSchema })`

---

## Frontend Changes

### 1. Schema update (`src/lib/schemas.ts`)

- Add `isActive: z.boolean().default(true)` to `EmployeeSchema`
- Change `standardHours` to `z.number().int().positive()`

### 2. Routing (`src/App.tsx`)

Add route: `<Route path='/employees' element={<Employees />} />`

### 3. New page: `src/pages/Employees.tsx`

**Access guard:** Redirect to `/` if no session employee or `!employee.isAdmin` (same pattern as `Summary.tsx`).

**Layout:**
- Page header: "Employees" title + "Add Employee" button (top-right)
- Table with columns: **Name**, **Std. Hours**, **Admin**, **Status**, **Actions**
  - **Status:** badge — "Active" (green) or "Inactive" (muted)
  - Inactive rows rendered with muted/dimmed style
  - **Actions:** "Edit" button (opens modal) + "Deactivate"/"Activate" button
    - **Self-deactivation guard:** the Deactivate button is disabled (greyed out) when `row._id === getSessionEmployee()?._id` to prevent the admin from locking themselves out
    - Deactivate triggers a confirmation dialog before calling `updateEmployee`:
      - Title: "Deactivate [Employee Name]?"
      - Body: "They will no longer appear in the employee selector. Their attendance data will be preserved."
      - Buttons: "Cancel" / "Deactivate"
    - Reactivate triggers a confirmation dialog:
      - Title: "Reactivate [Employee Name]?"
      - Body: "They will appear again in the employee selector."
      - Buttons: "Cancel" / "Reactivate"

### 4. New component: `src/components/EmployeeModal.tsx`

Reusable modal for create and edit modes.

**Fields:**
- Name — text input (required, non-empty)
- Standard Hours — number input (required, positive integer)
- Is Admin — checkbox

**Behaviour:**
- Create mode: empty form, title "Add Employee", calls `useCreateEmployee()`
- Edit mode: pre-filled form, title "Edit Employee", calls `useUpdateEmployee()`
- Submit button is disabled and shows a spinner while the mutation is in-flight (pending state from React Query)
- On success: closes modal, invalidates `['employees']` React Query cache
- **Session sync:** after a successful `updateEmployee`, if `updatedEmployee._id === getSessionEmployee()?._id`, call `setSessionEmployee(updatedEmployee)` with the fresh response to keep the session in sync
- **`isActive` in edit mode:** the `Employee` object passed to edit mode carries the current `isActive` value, which is forwarded unchanged in the PUT body — the modal does not expose or modify it

### 5. New hook file: `src/hooks/useEmployeeMutations.ts`

- `useCreateEmployee()` — React Query mutation wrapping `createEmployee()`
- `useUpdateEmployee()` — React Query mutation wrapping `updateEmployee()`
- Both invalidate `['employees']` query on success

### 6. Navigation (`src/pages/Attendance.tsx`)

In the admin action area (where "View Summary" lives), add a "Manage Employees" button. Both buttons are only visible when `employee.isAdmin === true`.

**Dirty-check guard:** The "Manage Employees" button follows the same `isDirty` guard pattern as "View Summary" — a `showEmployeesGuard` state triggers a confirmation `AlertDialog` before navigating to `/employees` when there are unsaved changes.

### 7. Home page (`src/pages/Home.tsx`)

Derive `const activeEmployees = employees.filter(e => e.isActive !== false)` once, then use `activeEmployees` everywhere on the page — both in the `EmployeeSelector` dropdown and in `handleContinue`'s `.find()` — so inactive employees cannot enter the session under any code path. (The `!== false` guard handles existing documents that may not yet have the field.)

### 8. Summary page (`src/pages/Summary.tsx`)

Add a **"Show inactive employees"** toggle (checkbox/switch) in the header, next to the month/year selectors. Off by default.

- **Off:** Filter out employees where `isActive === false` before rendering `SummaryTable`
- **On:** All employees passed to `SummaryTable`; inactive ones show with a muted style

`SummaryTable` requires no prop changes — `isActive` is already available on the `Employee` type after the schema update, and the component can reference `emp.isActive` directly for row styling. Inactive rows use `text-muted-foreground` on all cells, matching the muted badge treatment on the Employees page.

---

## Component & File Summary

| File | Change |
|---|---|
| `src/lib/schemas.ts` | Add `isActive` to `EmployeeSchema`; `standardHours` → `z.number().int().positive()` |
| `src/lib/mongoApi.ts` | Add `createEmployee()`, `updateEmployee()` |
| `api/employees.ts` | Add POST and PUT method handlers |
| `src/App.tsx` | Add `/employees` route |
| `src/pages/Employees.tsx` | **New** — admin-only employee management page |
| `src/components/EmployeeModal.tsx` | **New** — create/edit modal with in-flight state |
| `src/hooks/useEmployeeMutations.ts` | **New** — create/update mutations |
| `src/pages/Attendance.tsx` | Add "Manage Employees" button with dirty-check guard |
| `src/pages/Home.tsx` | Filter inactive employees via `activeEmployees` const |
| `src/pages/Summary.tsx` | Add "Show inactive" toggle |
| `src/components/SummaryTable.tsx` | Style inactive rows using `emp.isActive` |

---

## Out of Scope

- Server-side authentication (no change to the existing client-side session model)
- Deleting attendance records when an employee is deactivated (data is preserved)
- Bulk operations (deactivate multiple employees at once)
- Guard against removing admin rights from all employees (last-admin protection)
