# Employee UX & Color Improvements — Design Spec
**Date:** 2026-03-27
**Status:** Approved

---

## 1. Overview

Four frontend-only improvements to the attendance app:

1. **Full-Time / Part-Time dropdown** — replace the freeform "Standard Hours" number input with a two-option selector
2. **Tickets derived from employment type** — remove the `hasTickets` toggle; derive it automatically from Full-Time/Part-Time
3. **Generate Password button in create mode** — add the same generate/copy flow already present in the "Set Login" dialog
4. **Blue color theme + toast contrast fix** — switch the app accent color to blue via CSS variables; fix toast notification contrast with Sonner's `richColors`

No backend changes. No schema changes. No new dependencies.

---

## 2. Feature 1: Full-Time / Part-Time Dropdown

### Change: `src/components/EmployeeModal.tsx`

Replace the `<Input type="number">` for Standard Hours with a `<Select>` component:

- **Full-Time (8 hours)** → `standardHours = 8`
- **Part-Time (4 hours)** → `standardHours = 4`

Label in modal: **"Employment Type"** (replaces "Standard Hours / Day").

Default value for new employees: `Full-Time`.

When editing an existing employee: pre-select based on stored `standardHours` value (`8` → Full-Time, `4` → Part-Time, anything else → Full-Time as fallback).

The `standardHours` state type stays as a string `'8' | '4'` (converted to `Number` on submit, as before).

### Change: `src/pages/Employees.tsx`

In the employees table, the "Std. Hours" column display changes from `{emp.standardHours}h` to a human-readable label:
- `8` → `Full-Time`
- `4` → `Part-Time`
- any other value → `{emp.standardHours}h` (fallback for legacy data)

Column header stays "Type" (updated from "Std. Hours").

---

## 3. Feature 2: Tickets Derived from Employment Type

### Change: `src/components/EmployeeModal.tsx`

- Remove the `hasTickets` Switch toggle and its label entirely
- Remove the `hasTickets` state variable
- On submit, derive `hasTickets` from `standardHours`: `hasTickets = standardHours === '8'`

### No change to `src/lib/schemas.ts`

`hasTickets: z.boolean()` remains valid — the field still exists in the DB. It's just no longer exposed as an editable UI field. Existing employees with inconsistent values get corrected on their next edit/save.

### Change: `src/pages/Employees.tsx`

The "Tickets" column in the employees table is **removed** — it is now implicit from Full-Time/Part-Time (which is shown in the Type column). This reduces visual clutter.

---

## 4. Feature 3: Generate Password Button in Create Mode

### Change: `src/components/EmployeeModal.tsx`

When `email.trim()` is non-empty (the condition that shows the Default Password field), add a **Generate** button next to the "Default Password" label — same pattern as in the "Set Login" dialog in `Employees.tsx`.

**Behavior:**
- Click **Generate** → generates a 12-char password using `crypto.getRandomValues` (same algorithm as `handleGeneratePassword` in `Employees.tsx`)
- Password field switches to `type="text"` to show the generated value
- A **Copy** button appears next to the input; clicking it copies to clipboard and shows "Copied!" for 2 seconds

**State additions to `EmployeeModal.tsx`:**
- `passwordGenerated: boolean` — tracks whether current password was auto-generated (controls `type="text"` vs `"password"`)
- `passwordCopied: boolean` — controls "Copy" / "Copied!" label

Resetting the modal (open/close) clears both flags.

---

## 5. Feature 4: Blue Color Theme + Toast Contrast Fix

### Change: `src/index.css`

Update the `--primary` and `--primary-foreground` CSS custom properties (and their dark-mode equivalents in `.dark`) to a blue palette. shadcn/ui components that use `bg-primary`, `text-primary`, `ring-primary`, etc. inherit the new color automatically — no component-level changes needed.

Target blue: `221° 83% 53%` (HSL) — a clean medium blue similar to Tailwind's `blue-600`.

### Change: `App.tsx` (or wherever `<Toaster>` is mounted)

Add the `richColors` prop to the Sonner `<Toaster>` component:

```tsx
<Toaster richColors />
```

`richColors` enables high-contrast colored toasts:
- `toast.success()` → green background, white text
- `toast.error()` → red background, white text
- `toast.warning()` → yellow background, dark text
- `toast.info()` → blue background, white text

No changes to toast call sites (`toast.success(...)`, `toast.error(...)` etc.) — the prop applies globally.

---

## 6. Files Changed

| File | Change |
|---|---|
| `src/components/EmployeeModal.tsx` | Replace hours input with dropdown; remove hasTickets toggle; add generate/copy to password field |
| `src/pages/Employees.tsx` | Update Type column display; remove Tickets column |
| `src/index.css` | Update `--primary` CSS variables to blue |
| `App.tsx` | Add `richColors` to `<Toaster>` |

---

## 7. Constraints & Notes

- No new dependencies
- No backend or schema changes
- Existing employees: `hasTickets` value in DB gets overwritten to the correct derived value on next save — acceptable since the new rule is business logic, not a migration
- The fallback `{emp.standardHours}h` in the Type column ensures legacy employees with non-4/8 values still display correctly
