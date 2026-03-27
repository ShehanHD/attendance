# Employee UX & Color Improvements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the hours number input with a Full-Time/Part-Time dropdown, derive `hasTickets` automatically, add a generate-password button to the create modal, and switch the app accent to blue with high-contrast toast notifications.

**Architecture:** Four isolated frontend changes across three files. `EmployeeModal.tsx` gets the most changes (dropdown + derive hasTickets + generate password). `Employees.tsx` gets updated column display. `src/index.css` gets a new blue primary color. `src/main.tsx` gets `richColors` on the Toaster. No backend or schema changes.

**Tech Stack:** React 18, TypeScript, shadcn/ui (Select, Button, Input, Label), Sonner toasts, OKLCH CSS custom properties, Vitest (existing test suite — no component tests exist, manual verification used for UI)

---

## File Map

| File | Change |
|---|---|
| `src/components/EmployeeModal.tsx` | Replace hours input with Select; remove hasTickets state/toggle; add generate/copy to password field |
| `src/pages/Employees.tsx` | Update "Std. Hours" column to "Type" with Full-Time/Part-Time labels; remove "Tickets" column |
| `src/index.css` | Update `--primary` and `--ring` CSS variables to blue |
| `src/main.tsx` | Add `richColors` prop to `<Toaster />` |

---

## Task 1: EmployeeModal — dropdown, derive hasTickets, generate password

**Files:**
- Modify: `src/components/EmployeeModal.tsx`

This task rewrites the modal. Read it alongside this plan before starting.

Current state (lines 1-169):
- Imports `Switch` from shadcn — will be removed
- State: `standardHours: string`, `hasTickets: boolean`
- Hours field: `<Input type="number">`
- Has Tickets: `<Switch>` toggle
- Password field: plain `<Input type="password">`, no generate button

- [ ] **Step 1: Replace `src/components/EmployeeModal.tsx` with the full new version**

```tsx
import { useEffect, useState } from 'react'
import { Loader2 } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useCreateEmployee, useUpdateEmployee } from '@/hooks/useEmployeeMutations'
import type { Employee } from '@/lib/schemas'

interface Props {
  open: boolean
  onClose: () => void
  /** null = create mode; Employee = edit mode */
  employee: Employee | null
}

export default function EmployeeModal({ open, onClose, employee }: Props) {
  const { mutate: create, isPending: createPending } = useCreateEmployee()
  const { mutate: update, isPending: updatePending } = useUpdateEmployee()

  const [name, setName] = useState('')
  const [employmentType, setEmploymentType] = useState<'8' | '4'>('8')
  const [isAdmin, setIsAdmin] = useState(false)
  const [email, setEmail] = useState('')
  const [defaultPassword, setDefaultPassword] = useState('')
  const [passwordGenerated, setPasswordGenerated] = useState(false)
  const [passwordCopied, setPasswordCopied] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const isPending = createPending || updatePending
  const isEdit = employee !== null

  useEffect(() => {
    if (open) {
      setName(employee?.name ?? '')
      setEmploymentType(employee?.standardHours === 4 ? '4' : '8')
      setIsAdmin(employee?.isAdmin ?? false)
      setEmail('')
      setDefaultPassword('')
      setPasswordGenerated(false)
      setPasswordCopied(false)
      setError(null)
    }
  }, [open, employee])

  const handleGeneratePassword = () => {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789'
    const bytes = crypto.getRandomValues(new Uint8Array(12))
    const pwd = Array.from(bytes).map(b => chars[b % chars.length]).join('')
    setDefaultPassword(pwd)
    setPasswordGenerated(true)
    setPasswordCopied(false)
  }

  const handleCopyPassword = () => {
    navigator.clipboard.writeText(defaultPassword)
    setPasswordCopied(true)
    setTimeout(() => setPasswordCopied(false), 2000)
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) {
      setError('Name is required')
      return
    }
    setError(null)

    const standardHours = Number(employmentType)
    const hasTickets = employmentType === '8'

    if (isEdit && employee) {
      update(
        { ...employee, name: name.trim(), standardHours, isAdmin, hasTickets },
        { onSuccess: () => onClose() }
      )
    } else {
      const payload: Parameters<typeof create>[0] = { name: name.trim(), standardHours, isAdmin, hasTickets }
      if (email.trim()) payload.email = email.trim()
      if (defaultPassword) payload.password = defaultPassword
      create(payload, { onSuccess: () => onClose() })
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className='sm:max-w-md'>
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Edit Employee' : 'Add Employee'}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit}>
          <div className='space-y-4 py-2'>
            <div className='space-y-1'>
              <Label htmlFor='emp-name'>Name</Label>
              <Input
                id='emp-name'
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder='Full name'
                autoFocus
              />
            </div>
            <div className='space-y-1'>
              <Label htmlFor='emp-type'>Employment Type</Label>
              <Select value={employmentType} onValueChange={(v) => setEmploymentType(v as '8' | '4')}>
                <SelectTrigger id='emp-type'>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value='8'>Full-Time (8 hours)</SelectItem>
                  <SelectItem value='4'>Part-Time (4 hours)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className='flex items-center gap-2'>
              <input
                id='emp-admin'
                type='checkbox'
                className='h-4 w-4 rounded border-input'
                checked={isAdmin}
                onChange={(e) => setIsAdmin(e.target.checked)}
              />
              <Label htmlFor='emp-admin'>Admin</Label>
            </div>
            {!isEdit && (
              <>
                <div className='space-y-1'>
                  <Label htmlFor='emp-email'>Email <span className='text-muted-foreground font-normal'>(optional)</span></Label>
                  <Input
                    id='emp-email'
                    type='email'
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    placeholder='employee@company.com'
                    autoComplete='off'
                  />
                </div>
                {email.trim() && (
                  <div className='space-y-1'>
                    <div className='flex items-center justify-between'>
                      <Label htmlFor='emp-password'>Default Password</Label>
                      <Button
                        type='button'
                        size='sm'
                        variant='ghost'
                        className='h-auto py-0 text-xs text-muted-foreground hover:text-foreground'
                        onClick={handleGeneratePassword}
                      >
                        Generate
                      </Button>
                    </div>
                    <div className='flex gap-2'>
                      <Input
                        id='emp-password'
                        type={passwordGenerated ? 'text' : 'password'}
                        value={defaultPassword}
                        onChange={e => { setDefaultPassword(e.target.value); setPasswordGenerated(false) }}
                        placeholder='Min. 8 characters'
                        autoComplete='new-password'
                        className='font-mono'
                      />
                      {passwordGenerated && (
                        <Button
                          type='button'
                          size='sm'
                          variant='outline'
                          className='shrink-0'
                          onClick={handleCopyPassword}
                        >
                          {passwordCopied ? 'Copied!' : 'Copy'}
                        </Button>
                      )}
                    </div>
                    <p className='text-xs text-muted-foreground'>Employee will be asked to change this on first login.</p>
                  </div>
                )}
              </>
            )}
            {error && <p className='text-sm text-destructive'>{error}</p>}
          </div>
          <DialogFooter className='mt-4'>
            <Button type='button' variant='outline' onClick={onClose} disabled={isPending}>
              Cancel
            </Button>
            <Button type='submit' disabled={isPending}>
              {isPending && <Loader2 className='mr-2 h-4 w-4 animate-spin' />}
              {isEdit ? 'Save' : 'Add'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
```

- [ ] **Step 2: Run TypeScript check**

```bash
cd C:/Users/Don/Documents/attendance
npx tsc --noEmit
```

Expected: no errors. If there are errors about missing `Select` component, verify `src/components/ui/select.tsx` exists (it does — already used in `Employees.tsx`).

- [ ] **Step 3: Manual verification**

Start dev server (`npm run dev`), go to Settings → Employees:
- Click **Add Employee** — modal opens showing "Employment Type" dropdown (Full-Time / Part-Time), no "Has Tickets" toggle
- Select **Part-Time** — no toggle visible anywhere
- Enter an email — password field appears with **Generate** button next to label
- Click **Generate** — password shows as text, **Copy** button appears; clicking Copy changes label to "Copied!" briefly
- Click **Edit** on an existing employee with `standardHours: 8` → dropdown shows Full-Time; with `standardHours: 4` → Part-Time

- [ ] **Step 4: Commit**

```bash
git add src/components/EmployeeModal.tsx
git commit -m "feat: replace hours input with employment type dropdown, derive hasTickets, add generate password"
```

---

## Task 2: Employees.tsx — update column display

**Files:**
- Modify: `src/pages/Employees.tsx`

Two changes:
1. Column header "Std. Hours" → "Type"; cell `{emp.standardHours}h` → Full-Time / Part-Time label
2. Remove the "Tickets" column header and cell entirely

Current relevant lines (from `Employees.tsx`):
- Line ~170: `<TableHead>Std. Hours</TableHead>`
- Line ~171: `<TableHead>Admin</TableHead>`
- Line ~172: `<TableHead>Tickets</TableHead>`  ← remove
- Line ~185: `<TableCell className={cellClass}>{emp.standardHours}h</TableCell>`  ← update
- Lines ~187-189: the Tickets cell block  ← remove

- [ ] **Step 1: Update the "Std. Hours" column header**

In `src/pages/Employees.tsx`, find:

```tsx
                    <TableHead>Std. Hours</TableHead>
```

Replace with:

```tsx
                    <TableHead>Type</TableHead>
```

- [ ] **Step 2: Remove the Tickets column header**

Find and remove this line entirely:

```tsx
                    <TableHead>Tickets</TableHead>
```

- [ ] **Step 3: Update the standardHours cell value**

Find:

```tsx
                        <TableCell className={cellClass}>{emp.standardHours}h</TableCell>
```

Replace with:

```tsx
                        <TableCell className={cellClass}>
                          {emp.standardHours === 8 ? 'Full-Time' : emp.standardHours === 4 ? 'Part-Time' : `${emp.standardHours}h`}
                        </TableCell>
```

- [ ] **Step 4: Remove the Tickets cell**

Find and remove this block entirely:

```tsx
                        <TableCell>
                          {emp.hasTickets ? '✓' : '✗'}
                        </TableCell>
```

- [ ] **Step 5: Run TypeScript check**

```bash
cd C:/Users/Don/Documents/attendance
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 6: Manual verification**

In the running dev server, go to Settings → Employees:
- Table shows "Type" column with "Full-Time" / "Part-Time" values (or `Xh` for legacy)
- No "Tickets" column visible

- [ ] **Step 7: Commit**

```bash
git add src/pages/Employees.tsx
git commit -m "feat: show employment type label in employees table, remove redundant tickets column"
```

---

## Task 3: Blue color theme + toast contrast

**Files:**
- Modify: `src/index.css`
- Modify: `src/main.tsx`

### Part A — Blue primary color

The current `--primary` in `:root` is `oklch(0.437 0.286 266.260)` (dark violet). Change it to a clean blue by shifting hue to 257 and adjusting lightness up for better vibrancy.

Also update `--ring` so focus rings use the blue color instead of the current neutral gray.

- [ ] **Step 1: Update `--primary` and `--ring` in `src/index.css`**

Find (in the `:root` block):

```css
    --primary: oklch(0.437 0.286 266.260);
    --primary-foreground: oklch(0.985 0 0);
```

Replace with:

```css
    --primary: oklch(0.546 0.245 257.0);
    --primary-foreground: oklch(0.985 0 0);
```

Then find:

```css
    --ring: oklch(0.708 0 0);
```

Replace with:

```css
    --ring: oklch(0.546 0.245 257.0);
```

### Part B — richColors on Toaster

- [ ] **Step 2: Add `richColors` to `<Toaster />` in `src/main.tsx`**

Find in `src/main.tsx`:

```tsx
      <Toaster />
```

Replace with:

```tsx
      <Toaster richColors />
```

- [ ] **Step 3: Manual verification**

In the running dev server:
- Primary buttons (e.g. "Add Employee", "Save") are now blue instead of violet
- Focus rings on inputs/buttons are blue
- Trigger a success toast (save an employee) → toast shows green background with white text
- Trigger an error toast (try saving with empty name) → toast shows red background with white text

- [ ] **Step 4: Commit**

```bash
git add src/index.css src/main.tsx
git commit -m "feat: switch accent color to blue, enable richColors on Sonner toaster"
```

---

## Final check

- [ ] **Run the existing test suite**

```bash
cd C:/Users/Don/Documents/attendance
npx vitest run
```

Expected: same pass/fail count as before (pre-existing failures are unrelated to these changes). No new failures.
