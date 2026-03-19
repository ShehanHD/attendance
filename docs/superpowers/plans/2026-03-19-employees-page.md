# Employees Management Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an admin-only `/employees` page for full CRUD (create, edit, soft-delete) of employees, plus a "Show inactive" toggle on the Summary page.

**Architecture:** Extend `api/employees.ts` with POST/PUT handlers; add `createEmployee`/`updateEmployee` to the API client; build a shared `EmployeeModal` and a new `Employees` page following the existing Summary/Attendance patterns. Schema gains `isActive: boolean`.

**Tech Stack:** React 19, TypeScript, Vite 8, Tailwind, shadcn/ui, React Query v5, Zod 4, MongoDB (Node.js driver v7), Vercel serverless functions.

---

## File Map

| File | Action |
|---|---|
| `src/lib/schemas.ts` | Modify — add `isActive`, tighten `standardHours` |
| `src/lib/schemas.test.ts` | Create — schema unit tests |
| `api/employees.ts` | Modify — add POST and PUT handlers |
| `api/employees.test.ts` | Modify — update 405 test; add POST/PUT tests |
| `src/lib/mongoApi.ts` | Modify — add `createEmployee`, `updateEmployee` |
| `src/hooks/useEmployeeMutations.ts` | Create — `useCreateEmployee`, `useUpdateEmployee` |
| `src/components/EmployeeModal.tsx` | Create — create/edit modal |
| `src/pages/Employees.tsx` | Create — admin-only management page |
| `src/App.tsx` | Modify — add `/employees` route |
| `src/pages/Attendance.tsx` | Modify — add "Manage Employees" button + guard |
| `src/pages/Home.tsx` | Modify — filter inactive employees |
| `src/components/SummaryTable.tsx` | Modify — muted style for inactive rows |
| `src/pages/Summary.tsx` | Modify — "Show inactive" toggle |

---

## Task 1: Update `EmployeeSchema`

**Files:**
- Modify: `src/lib/schemas.ts`
- Create: `src/lib/schemas.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/lib/schemas.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { EmployeeSchema } from './schemas'

describe('EmployeeSchema', () => {
  const base = { _id: '1', name: 'Alice', standardHours: 8, isAdmin: false }

  it('defaults isActive to true when field is absent', () => {
    expect(EmployeeSchema.parse(base).isActive).toBe(true)
  })

  it('preserves isActive: false', () => {
    expect(EmployeeSchema.parse({ ...base, isActive: false }).isActive).toBe(false)
  })

  it('accepts isActive: true explicitly', () => {
    expect(EmployeeSchema.parse({ ...base, isActive: true }).isActive).toBe(true)
  })

  it('rejects non-integer standardHours', () => {
    expect(() => EmployeeSchema.parse({ ...base, standardHours: 7.5 })).toThrow()
  })

  it('rejects zero standardHours', () => {
    expect(() => EmployeeSchema.parse({ ...base, standardHours: 0 })).toThrow()
  })

  it('rejects negative standardHours', () => {
    expect(() => EmployeeSchema.parse({ ...base, standardHours: -1 })).toThrow()
  })
})
```

- [ ] **Step 2: Run tests — verify they fail**

```bash
npx vitest run src/lib/schemas.test.ts
```

Expected: FAIL — `isActive` field does not exist, `standardHours` still accepts decimals.

- [ ] **Step 3: Update `src/lib/schemas.ts`**

```ts
import { z } from 'zod'

export const EmployeeSchema = z.object({
  _id: z.string(),
  name: z.string(),
  standardHours: z.number().int().positive(),
  isAdmin: z.boolean(),
  isActive: z.boolean().default(true),
})

export const AttendanceEntryTypeSchema = z.enum([
  'present',
  'absent',
  'vacation',
  'sick',
])

export const AttendanceEntrySchema = z.object({
  _id: z.string(),
  employeeId: z.string(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  type: AttendanceEntryTypeSchema,
  hours: z.number().min(0).max(24),
  // sickRef conditionality (required when type="sick") is enforced by the
  // pre-save UI guard — not by a schema refinement — to avoid rejecting
  // valid API responses where type !== "sick" and sickRef is null.
  sickRef: z.string().trim().min(1).max(200).nullable(),
})

export const CompanyClosureSchema = z.object({
  _id: z.string(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  note: z.string().nullable(),
})

export type Employee = z.infer<typeof EmployeeSchema>
export type AttendanceEntryType = z.infer<typeof AttendanceEntryTypeSchema>
export type AttendanceEntry = z.infer<typeof AttendanceEntrySchema>
export type CompanyClosure = z.infer<typeof CompanyClosureSchema>
```

- [ ] **Step 4: Run tests — verify they pass**

```bash
npx vitest run src/lib/schemas.test.ts
```

Expected: 6 passing.

- [ ] **Step 5: Commit**

```bash
git add src/lib/schemas.ts src/lib/schemas.test.ts
git commit -m "feat: add isActive to EmployeeSchema, tighten standardHours to int"
```

---

## Task 2: Extend `api/employees.ts` with POST and PUT

**Files:**
- Modify: `api/employees.ts`
- Modify: `api/employees.test.ts`

- [ ] **Step 1: Write the failing tests**

Replace the contents of `api/employees.test.ts`:

```ts
// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { VercelRequest, VercelResponse } from '@vercel/node'

vi.mock('./_db.js', () => ({
  getDb: vi.fn(),
}))

import { getDb } from './_db.js'
import handler from './employees.js'

const mockGetDb = vi.mocked(getDb)

function makeRes() {
  const res = {
    status: vi.fn(),
    json: vi.fn(),
    end: vi.fn(),
  } as unknown as VercelResponse
  ;(res.status as ReturnType<typeof vi.fn>).mockReturnValue(res)
  return res
}

function makeReq(method = 'GET', body?: unknown): VercelRequest {
  return { method, body } as VercelRequest
}

describe('GET /api/employees', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns employees with _id serialized to string', async () => {
    const objectId = { toString: () => 'abc123' }
    mockGetDb.mockResolvedValue({
      collection: () => ({
        find: () => ({
          toArray: async () => [
            { _id: objectId, name: 'Alice', standardHours: 8, isAdmin: false, isActive: true },
          ],
        }),
      }),
    } as never)

    const req = makeReq()
    const res = makeRes()
    await handler(req, res)

    expect((res.status as ReturnType<typeof vi.fn>).mock.calls[0][0]).toBe(200)
    expect((res.json as ReturnType<typeof vi.fn>).mock.calls[0][0]).toEqual({
      employees: [
        { _id: 'abc123', name: 'Alice', standardHours: 8, isAdmin: false, isActive: true },
      ],
    })
  })

  it('returns 500 when getDb throws', async () => {
    mockGetDb.mockRejectedValue(new Error('connection failed'))
    const req = makeReq()
    const res = makeRes()
    await handler(req, res)
    expect((res.status as ReturnType<typeof vi.fn>).mock.calls[0][0]).toBe(500)
  })
})

describe('POST /api/employees', () => {
  beforeEach(() => vi.clearAllMocks())

  it('creates an employee and returns 201 with the new employee', async () => {
    const insertedId = { toString: () => 'newid123' }
    mockGetDb.mockResolvedValue({
      collection: () => ({
        insertOne: async () => ({ insertedId }),
      }),
    } as never)

    const body = { name: 'Bob', standardHours: 8, isAdmin: false }
    const req = makeReq('POST', body)
    const res = makeRes()
    await handler(req, res)

    expect((res.status as ReturnType<typeof vi.fn>).mock.calls[0][0]).toBe(201)
    expect((res.json as ReturnType<typeof vi.fn>).mock.calls[0][0]).toEqual({
      employee: { _id: 'newid123', name: 'Bob', standardHours: 8, isAdmin: false, isActive: true },
    })
  })

  it('returns 400 for missing name', async () => {
    const req = makeReq('POST', { standardHours: 8, isAdmin: false })
    const res = makeRes()
    await handler(req, res)
    expect((res.status as ReturnType<typeof vi.fn>).mock.calls[0][0]).toBe(400)
  })

  it('returns 400 for non-integer standardHours', async () => {
    const req = makeReq('POST', { name: 'Bob', standardHours: 7.5, isAdmin: false })
    const res = makeRes()
    await handler(req, res)
    expect((res.status as ReturnType<typeof vi.fn>).mock.calls[0][0]).toBe(400)
  })

  it('returns 500 when getDb throws', async () => {
    mockGetDb.mockRejectedValue(new Error('db error'))
    const req = makeReq('POST', { name: 'Bob', standardHours: 8, isAdmin: false })
    const res = makeRes()
    await handler(req, res)
    expect((res.status as ReturnType<typeof vi.fn>).mock.calls[0][0]).toBe(500)
  })
})

describe('PUT /api/employees', () => {
  beforeEach(() => vi.clearAllMocks())

  const VALID_ID = '507f1f77bcf86cd799439011'

  it('updates an employee and returns 200 with the updated employee', async () => {
    const objectId = { toString: () => VALID_ID }
    mockGetDb.mockResolvedValue({
      collection: () => ({
        findOneAndUpdate: async () => ({
          _id: objectId,
          name: 'Alice Updated',
          standardHours: 7,
          isAdmin: true,
          isActive: true,
        }),
      }),
    } as never)

    const body = {
      _id: VALID_ID,
      name: 'Alice Updated',
      standardHours: 7,
      isAdmin: true,
      isActive: true,
    }
    const req = makeReq('PUT', body)
    const res = makeRes()
    await handler(req, res)

    expect((res.status as ReturnType<typeof vi.fn>).mock.calls[0][0]).toBe(200)
    expect((res.json as ReturnType<typeof vi.fn>).mock.calls[0][0]).toEqual({
      employee: {
        _id: VALID_ID,
        name: 'Alice Updated',
        standardHours: 7,
        isAdmin: true,
        isActive: true,
      },
    })
  })

  it('returns 404 when employee is not found', async () => {
    mockGetDb.mockResolvedValue({
      collection: () => ({
        findOneAndUpdate: async () => null,
      }),
    } as never)

    const req = makeReq('PUT', {
      _id: VALID_ID,
      name: 'Alice',
      standardHours: 8,
      isAdmin: false,
      isActive: true,
    })
    const res = makeRes()
    await handler(req, res)
    expect((res.status as ReturnType<typeof vi.fn>).mock.calls[0][0]).toBe(404)
  })

  it('returns 400 for invalid _id format', async () => {
    const req = makeReq('PUT', {
      _id: 'not-a-valid-objectid',
      name: 'Alice',
      standardHours: 8,
      isAdmin: false,
      isActive: true,
    })
    const res = makeRes()
    await handler(req, res)
    expect((res.status as ReturnType<typeof vi.fn>).mock.calls[0][0]).toBe(400)
  })

  it('returns 400 for missing body fields', async () => {
    const req = makeReq('PUT', { _id: VALID_ID })
    const res = makeRes()
    await handler(req, res)
    expect((res.status as ReturnType<typeof vi.fn>).mock.calls[0][0]).toBe(400)
  })

  it('returns 500 when getDb throws', async () => {
    mockGetDb.mockRejectedValue(new Error('db error'))
    const req = makeReq('PUT', {
      _id: VALID_ID,
      name: 'Alice',
      standardHours: 8,
      isAdmin: false,
      isActive: true,
    })
    const res = makeRes()
    await handler(req, res)
    expect((res.status as ReturnType<typeof vi.fn>).mock.calls[0][0]).toBe(500)
  })
})

describe('unsupported methods', () => {
  it('returns 405 for DELETE', async () => {
    const req = makeReq('DELETE')
    const res = makeRes()
    await handler(req, res)
    expect((res.status as ReturnType<typeof vi.fn>).mock.calls[0][0]).toBe(405)
  })
})
```

- [ ] **Step 2: Run tests — verify they fail**

```bash
npx vitest run api/employees.test.ts
```

Expected: FAIL — POST and PUT not implemented, DELETE 405 test renamed.

- [ ] **Step 3: Implement POST and PUT in `api/employees.ts`**

```ts
import { z } from 'zod'
import { ObjectId } from 'mongodb'
import type { VercelRequest, VercelResponse } from '@vercel/node'
import { getDb } from './_db.js'

const PostBodySchema = z.object({
  name: z.string().min(1),
  standardHours: z.number().int().positive(),
  isAdmin: z.boolean(),
})

const PutBodySchema = z.object({
  _id: z.string().min(1),
  name: z.string().min(1),
  standardHours: z.number().int().positive(),
  isAdmin: z.boolean(),
  isActive: z.boolean(),
})

export default async function handler(
  req: VercelRequest,
  res: VercelResponse
): Promise<void> {
  if (req.method === 'GET') {
    await handleGet(res)
  } else if (req.method === 'POST') {
    await handlePost(req, res)
  } else if (req.method === 'PUT') {
    await handlePut(req, res)
  } else {
    res.status(405).json({ error: 'Method not allowed' })
  }
}

async function handleGet(res: VercelResponse): Promise<void> {
  try {
    const db = await getDb()
    const docs = await db.collection('employees').find({}).toArray()
    const employees = docs.map(({ _id, ...rest }) => ({ ...rest, _id: _id.toString() }))
    res.status(200).json({ employees })
  } catch {
    res.status(500).json({ error: 'Internal server error' })
  }
}

async function handlePost(req: VercelRequest, res: VercelResponse): Promise<void> {
  const parsed = PostBodySchema.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0].message })
    return
  }
  const { name, standardHours, isAdmin } = parsed.data
  try {
    const db = await getDb()
    const result = await db
      .collection('employees')
      .insertOne({ name, standardHours, isAdmin, isActive: true })
    const employee = {
      _id: result.insertedId.toString(),
      name,
      standardHours,
      isAdmin,
      isActive: true,
    }
    res.status(201).json({ employee })
  } catch {
    res.status(500).json({ error: 'Internal server error' })
  }
}

async function handlePut(req: VercelRequest, res: VercelResponse): Promise<void> {
  const parsed = PutBodySchema.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0].message })
    return
  }
  const { _id, ...fields } = parsed.data
  let oid: ObjectId
  try {
    oid = new ObjectId(_id)
  } catch {
    res.status(400).json({ error: 'Invalid employee ID' })
    return
  }
  try {
    const db = await getDb()
    const result = await db
      .collection('employees')
      .findOneAndUpdate({ _id: oid }, { $set: fields }, { returnDocument: 'after' })
    if (!result) {
      res.status(404).json({ error: 'Employee not found' })
      return
    }
    const { _id: docId, ...rest } = result as { _id: { toString(): string }; [key: string]: unknown }
    res.status(200).json({ employee: { _id: docId.toString(), ...rest } })
  } catch {
    res.status(500).json({ error: 'Internal server error' })
  }
}
```

- [ ] **Step 4: Run tests — verify they pass**

```bash
npx vitest run api/employees.test.ts
```

Expected: all tests passing.

- [ ] **Step 5: Commit**

```bash
git add api/employees.ts api/employees.test.ts
git commit -m "feat: add POST and PUT handlers to /api/employees"
```

---

## Task 3: Add `createEmployee` and `updateEmployee` to `mongoApi.ts`

**Files:**
- Modify: `src/lib/mongoApi.ts`

- [ ] **Step 1: Add the two functions**

Append to `src/lib/mongoApi.ts` after the `fetchEmployees` function:

```ts
export async function createEmployee(data: {
  name: string
  standardHours: number
  isAdmin: boolean
}): Promise<Employee> {
  const result = await apiFetch(
    '/api/employees',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    },
    z.object({ employee: EmployeeSchema })
  )
  return result.employee
}

export async function updateEmployee(data: Employee): Promise<Employee> {
  const result = await apiFetch(
    '/api/employees',
    {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    },
    z.object({ employee: EmployeeSchema })
  )
  return result.employee
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/lib/mongoApi.ts
git commit -m "feat: add createEmployee and updateEmployee to API client"
```

---

## Task 4: Create `useEmployeeMutations.ts`

**Files:**
- Create: `src/hooks/useEmployeeMutations.ts`

- [ ] **Step 1: Create the hook file**

```ts
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { createEmployee, updateEmployee } from '@/lib/mongoApi'

export function useCreateEmployee() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: createEmployee,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['employees'] })
    },
  })
}

export function useUpdateEmployee() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: updateEmployee,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['employees'] })
    },
  })
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/hooks/useEmployeeMutations.ts
git commit -m "feat: add useCreateEmployee and useUpdateEmployee hooks"
```

---

## Task 5: Create `EmployeeModal.tsx`

**Files:**
- Create: `src/components/EmployeeModal.tsx`

- [ ] **Step 1: Create the component**

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
import { useCreateEmployee, useUpdateEmployee } from '@/hooks/useEmployeeMutations'
import { getSessionEmployee, setSessionEmployee } from '@/lib/session'
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
  const [standardHours, setStandardHours] = useState('')
  const [isAdmin, setIsAdmin] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const isPending = createPending || updatePending
  const isEdit = employee !== null

  useEffect(() => {
    if (open) {
      setName(employee?.name ?? '')
      setStandardHours(employee ? String(employee.standardHours) : '')
      setIsAdmin(employee?.isAdmin ?? false)
      setError(null)
    }
  }, [open, employee])

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const hours = Number(standardHours)
    if (!name.trim()) {
      setError('Name is required')
      return
    }
    if (!Number.isInteger(hours) || hours <= 0) {
      setError('Standard hours must be a positive whole number')
      return
    }
    setError(null)

    if (isEdit && employee) {
      update(
        { ...employee, name: name.trim(), standardHours: hours, isAdmin },
        {
          onSuccess: (updated) => {
            if (updated._id === getSessionEmployee()?._id) {
              setSessionEmployee(updated)
            }
            onClose()
          },
        }
      )
    } else {
      create(
        { name: name.trim(), standardHours: hours, isAdmin },
        { onSuccess: () => onClose() }
      )
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
              <Label htmlFor='emp-hours'>Standard Hours / Day</Label>
              <Input
                id='emp-hours'
                type='number'
                min={1}
                step={1}
                value={standardHours}
                onChange={(e) => setStandardHours(e.target.value)}
                placeholder='8'
              />
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

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/EmployeeModal.tsx
git commit -m "feat: add EmployeeModal component for create/edit"
```

---

## Task 6: Create `Employees.tsx` page

**Files:**
- Create: `src/pages/Employees.tsx`

- [ ] **Step 1: Create the page**

```tsx
import { useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Alert, AlertDescription } from '@/components/ui/alert'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { useEmployees } from '@/hooks/useEmployees'
import { useUpdateEmployee } from '@/hooks/useEmployeeMutations'
import EmployeeModal from '@/components/EmployeeModal'
import { getSessionEmployee } from '@/lib/session'
import type { Employee } from '@/lib/schemas'

export default function Employees() {
  const employee = getSessionEmployee()
  const navigate = useNavigate()
  const { data: employees, isLoading, isError, refetch } = useEmployees()
  const { mutate: updateEmployee, isPending: updatePending } = useUpdateEmployee()

  const [modalOpen, setModalOpen] = useState(false)
  const [editTarget, setEditTarget] = useState<Employee | null>(null)
  const [deactivateTarget, setDeactivateTarget] = useState<Employee | null>(null)
  const [reactivateTarget, setReactivateTarget] = useState<Employee | null>(null)

  // Route guard — after all hooks
  if (!employee || !employee.isAdmin) return <Navigate to='/' replace />

  if (isLoading) {
    return (
      <div className='flex min-h-screen items-center justify-center'>
        <p className='text-muted-foreground'>Loading…</p>
      </div>
    )
  }

  if (isError) {
    return (
      <div className='flex min-h-screen items-center justify-center p-8'>
        <Alert variant='destructive' className='max-w-md'>
          <AlertDescription>
            Failed to load employees.{' '}
            <button onClick={() => refetch()} className='underline'>
              Retry
            </button>
          </AlertDescription>
        </Alert>
      </div>
    )
  }

  const sessionId = employee._id

  const handleAdd = () => {
    setEditTarget(null)
    setModalOpen(true)
  }

  const handleEdit = (emp: Employee) => {
    setEditTarget(emp)
    setModalOpen(true)
  }

  const handleDeactivateConfirm = () => {
    if (!deactivateTarget) return
    updateEmployee(
      { ...deactivateTarget, isActive: false },
      { onSuccess: () => setDeactivateTarget(null) }
    )
  }

  const handleReactivateConfirm = () => {
    if (!reactivateTarget) return
    updateEmployee(
      { ...reactivateTarget, isActive: true },
      { onSuccess: () => setReactivateTarget(null) }
    )
  }

  return (
    <div className='min-h-screen bg-background'>
      <header className='border-b px-6 py-4 flex items-center justify-between'>
        <h1 className='text-xl font-semibold'>Employees</h1>
        <div className='flex gap-2'>
          <Button onClick={handleAdd}>Add Employee</Button>
          <Button variant='outline' onClick={() => navigate('/attendance')}>
            Back
          </Button>
        </div>
      </header>

      <main className='p-6'>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Std. Hours</TableHead>
              <TableHead>Admin</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {(employees ?? []).map((emp) => {
              const isInactive = emp.isActive === false
              const cellClass = isInactive ? 'text-muted-foreground' : ''
              return (
                <TableRow key={emp._id}>
                  <TableCell className={`font-medium ${cellClass}`}>{emp.name}</TableCell>
                  <TableCell className={cellClass}>{emp.standardHours}h</TableCell>
                  <TableCell className={cellClass}>{emp.isAdmin ? 'Yes' : '—'}</TableCell>
                  <TableCell>
                    <Badge variant={isInactive ? 'secondary' : 'default'}>
                      {isInactive ? 'Inactive' : 'Active'}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <div className='flex gap-2'>
                      <Button size='sm' variant='outline' onClick={() => handleEdit(emp)}>
                        Edit
                      </Button>
                      {isInactive ? (
                        <Button
                          size='sm'
                          variant='ghost'
                          onClick={() => setReactivateTarget(emp)}
                        >
                          Activate
                        </Button>
                      ) : (
                        <Button
                          size='sm'
                          variant='ghost'
                          onClick={() => setDeactivateTarget(emp)}
                          disabled={emp._id === sessionId}
                          title={emp._id === sessionId ? 'Cannot deactivate your own account' : undefined}
                        >
                          Deactivate
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      </main>

      <EmployeeModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        employee={editTarget}
      />

      {/* Deactivate confirmation */}
      <AlertDialog open={deactivateTarget !== null}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Deactivate {deactivateTarget?.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              They will no longer appear in the employee selector. Their attendance data will be
              preserved.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setDeactivateTarget(null)}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeactivateConfirm} disabled={updatePending}>
              Deactivate
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Reactivate confirmation */}
      <AlertDialog open={reactivateTarget !== null}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Reactivate {reactivateTarget?.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              They will appear again in the employee selector.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setReactivateTarget(null)}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleReactivateConfirm} disabled={updatePending}>
              Reactivate
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/pages/Employees.tsx
git commit -m "feat: add Employees admin page"
```

---

## Task 7: Add `/employees` route to `App.tsx`

**Files:**
- Modify: `src/App.tsx`

- [ ] **Step 1: Add the import and route**

Replace the contents of `src/App.tsx`:

```tsx
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import Home from '@/pages/Home'
import Attendance from '@/pages/Attendance'
import Summary from '@/pages/Summary'
import Employees from '@/pages/Employees'

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path='/' element={<Home />} />
        <Route path='/attendance' element={<Attendance />} />
        <Route path='/summary' element={<Summary />} />
        <Route path='/employees' element={<Employees />} />
      </Routes>
    </BrowserRouter>
  )
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/App.tsx
git commit -m "feat: add /employees route"
```

---

## Task 8: Add "Manage Employees" button to `Attendance.tsx`

**Files:**
- Modify: `src/pages/Attendance.tsx`

- [ ] **Step 1: Add state, handler, button, and guard dialog**

Replace the contents of `src/pages/Attendance.tsx`:

```tsx
import { useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import AttendanceGrid from '@/components/AttendanceGrid'
import { useClosures } from '@/hooks/useClosures'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { getSessionEmployee } from '@/lib/session'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'

export default function Attendance() {
  const employee = getSessionEmployee()
  const navigate = useNavigate()
  const { data: closures, isLoading, isError, refetch } = useClosures()
  const [isDirty, setIsDirty] = useState(false)
  const [showSummaryGuard, setShowSummaryGuard] = useState(false)
  const [showEmployeesGuard, setShowEmployeesGuard] = useState(false)
  const [showHomeGuard, setShowHomeGuard] = useState(false)

  // Route guard
  if (!employee) return <Navigate to='/' replace />

  if (isLoading) {
    return (
      <div className='flex min-h-screen items-center justify-center'>
        <p className='text-muted-foreground'>Loading…</p>
      </div>
    )
  }

  if (isError) {
    return (
      <div className='flex min-h-screen items-center justify-center p-8'>
        <Alert variant='destructive' className='max-w-md'>
          <AlertDescription>
            Failed to load company closures.{' '}
            <button onClick={() => refetch()} className='underline'>Retry</button>
          </AlertDescription>
        </Alert>
      </div>
    )
  }

  const handleSummaryClick = () => {
    if (isDirty) setShowSummaryGuard(true)
    else navigate('/summary')
  }

  const handleEmployeesClick = () => {
    if (isDirty) setShowEmployeesGuard(true)
    else navigate('/employees')
  }

  const handleHomeClick = () => {
    if (isDirty) setShowHomeGuard(true)
    else navigate('/')
  }

  return (
    <div className='min-h-screen bg-background'>
      <header className='border-b px-6 py-4 flex items-center justify-between'>
        <div>
          <h1 className='text-xl font-semibold'>Attendance</h1>
          <p className='text-sm text-muted-foreground'>{employee.name}</p>
        </div>
        <div className='flex gap-2'>
          {employee.isAdmin && (
            <>
              <Button variant='outline' onClick={handleSummaryClick}>
                View Summary
              </Button>
              <Button variant='outline' onClick={handleEmployeesClick}>
                Manage Employees
              </Button>
            </>
          )}
          <Button variant='ghost' onClick={handleHomeClick}>
            Change employee
          </Button>
        </div>
      </header>

      <main className='p-6'>
        <AttendanceGrid
          employee={employee}
          closures={closures ?? []}
          onDirtyChange={setIsDirty}
        />
      </main>

      {/* Guard: navigate to Summary */}
      <AlertDialog open={showSummaryGuard}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Unsaved changes</AlertDialogTitle>
            <AlertDialogDescription>
              You have unsaved changes. Leave without saving?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setShowSummaryGuard(false)}>Stay</AlertDialogCancel>
            <AlertDialogAction onClick={() => { setShowSummaryGuard(false); navigate('/summary') }}>Leave</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Guard: navigate to Employees */}
      <AlertDialog open={showEmployeesGuard}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Unsaved changes</AlertDialogTitle>
            <AlertDialogDescription>
              You have unsaved changes. Leave without saving?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setShowEmployeesGuard(false)}>Stay</AlertDialogCancel>
            <AlertDialogAction onClick={() => { setShowEmployeesGuard(false); navigate('/employees') }}>Leave</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Guard: navigate home */}
      <AlertDialog open={showHomeGuard}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Unsaved changes</AlertDialogTitle>
            <AlertDialogDescription>
              You have unsaved changes. Leave without saving?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setShowHomeGuard(false)}>Stay</AlertDialogCancel>
            <AlertDialogAction onClick={() => { setShowHomeGuard(false); navigate('/') }}>Leave</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/pages/Attendance.tsx
git commit -m "feat: add Manage Employees button with dirty-check guard"
```

---

## Task 9: Filter inactive employees in `Home.tsx`

**Files:**
- Modify: `src/pages/Home.tsx`

- [ ] **Step 1: Add `activeEmployees` filter**

Replace the contents of `src/pages/Home.tsx`:

```tsx
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useEmployees } from '@/hooks/useEmployees'
import EmployeeSelector from '@/components/EmployeeSelector'
import { Button } from '@/components/ui/button'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { setSessionEmployee } from '@/lib/session'

export default function Home() {
  const navigate = useNavigate()
  const { data: employees, isLoading, isError, refetch } = useEmployees()
  const [selectedId, setSelectedId] = useState<string | null>(null)

  if (isLoading) {
    return (
      <div className='flex min-h-screen items-center justify-center'>
        <p className='text-muted-foreground'>Loading employees…</p>
      </div>
    )
  }

  if (isError) {
    return (
      <div className='flex min-h-screen items-center justify-center p-8'>
        <Alert variant='destructive' className='max-w-md'>
          <AlertDescription>
            Failed to load employees.{' '}
            <button onClick={() => refetch()} className='underline'>
              Retry
            </button>
          </AlertDescription>
        </Alert>
      </div>
    )
  }

  // Exclude inactive employees — they should not be selectable
  const activeEmployees = (employees ?? []).filter((e) => e.isActive !== false)

  const handleContinue = () => {
    if (!selectedId) return
    const employee = activeEmployees.find((e) => e._id === selectedId)
    if (!employee) return
    setSessionEmployee(employee)
    navigate('/attendance')
  }

  return (
    <div className='flex min-h-screen items-center justify-center bg-background'>
      <div className='flex flex-col gap-6 rounded-lg border bg-card p-8 shadow-sm'>
        <h1 className='text-2xl font-semibold'>Attendance</h1>
        <p className='text-muted-foreground'>Select your name to continue.</p>

        {activeEmployees.length === 0 ? (
          <p className='text-muted-foreground'>No employee records found.</p>
        ) : (
          <EmployeeSelector
            employees={activeEmployees}
            value={selectedId}
            onChange={setSelectedId}
          />
        )}

        <Button onClick={handleContinue} disabled={!selectedId}>
          Continue
        </Button>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/pages/Home.tsx
git commit -m "feat: filter inactive employees from Home page selector"
```

---

## Task 10: Style inactive rows in `SummaryTable.tsx`

**Files:**
- Modify: `src/components/SummaryTable.tsx`

- [ ] **Step 1: Add muted styling for inactive rows**

Replace the contents of `src/components/SummaryTable.tsx`:

```tsx
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { computeSummary } from '@/lib/attendanceUtils'
import type { AttendanceEntry, Employee } from '@/lib/schemas'

interface Props {
  employees: Employee[]
  allEntries: AttendanceEntry[]
}

export default function SummaryTable({ employees, allEntries }: Props) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Employee</TableHead>
          <TableHead className='text-right'>Hours Worked</TableHead>
          <TableHead className='text-right'>Vacation Days</TableHead>
          <TableHead className='text-right'>Sick Days</TableHead>
          <TableHead className='text-right'>Tickets</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {employees.map((emp) => {
          const empEntries = allEntries.filter((e) => e.employeeId === emp._id)
          const s = computeSummary(empEntries)
          const cellClass = emp.isActive === false ? 'text-muted-foreground' : ''
          return (
            <TableRow key={emp._id}>
              <TableCell className={`font-medium ${cellClass}`}>{emp.name}</TableCell>
              <TableCell className={`text-right ${cellClass}`}>{s.hoursWorked}h</TableCell>
              <TableCell className={`text-right ${cellClass}`}>{s.vacationDays}</TableCell>
              <TableCell className={`text-right ${cellClass}`}>{s.sickDays}</TableCell>
              <TableCell className={`text-right ${cellClass}`}>{s.tickets}</TableCell>
            </TableRow>
          )
        })}
      </TableBody>
    </Table>
  )
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/SummaryTable.tsx
git commit -m "feat: mute inactive employee rows in SummaryTable"
```

---

## Task 11: Add "Show inactive" toggle to `Summary.tsx`

**Files:**
- Modify: `src/pages/Summary.tsx`

- [ ] **Step 1: Add toggle state and filter logic**

Replace the contents of `src/pages/Summary.tsx`:

```tsx
import { useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { useQuery } from '@tanstack/react-query'
import { useEmployees } from '@/hooks/useEmployees'
import SummaryTable from '@/components/SummaryTable'
import { fetchAllEntriesForMonth } from '@/lib/mongoApi'
import { getSessionEmployee } from '@/lib/session'

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

export default function Summary() {
  const employee = getSessionEmployee()
  const navigate = useNavigate()

  const now = new Date()
  const currentYear = now.getFullYear()
  const YEARS = [currentYear - 1, currentYear, currentYear + 1]

  const [month, setMonth] = useState(now.getMonth() + 1)
  const [year, setYear] = useState(currentYear)
  const [showInactive, setShowInactive] = useState(false)

  const { data: employees, isLoading: empLoading, isError: empError } = useEmployees()

  const {
    data: allEntries,
    isLoading: entriesLoading,
    isError: entriesError,
    refetch,
  } = useQuery({
    queryKey: ['summary-entries', year, month],
    queryFn: () => fetchAllEntriesForMonth(year, month),
    enabled: employee !== null && employee.isAdmin === true,
  })

  // Route guards — AFTER all hooks
  if (!employee || !employee.isAdmin) return <Navigate to='/' replace />

  const isLoading = empLoading || entriesLoading
  const isError = empError || entriesError

  if (isLoading) {
    return (
      <div className='flex min-h-screen items-center justify-center'>
        <p className='text-muted-foreground'>Loading…</p>
      </div>
    )
  }

  if (isError) {
    return (
      <div className='flex min-h-screen items-center justify-center p-8'>
        <Alert variant='destructive' className='max-w-md'>
          <AlertDescription>
            Failed to load summary data.{' '}
            <button onClick={() => refetch()} className='underline'>Retry</button>
          </AlertDescription>
        </Alert>
      </div>
    )
  }

  const visibleEmployees = showInactive
    ? (employees ?? [])
    : (employees ?? []).filter((e) => e.isActive !== false)

  return (
    <div className='min-h-screen bg-background'>
      <header className='border-b px-6 py-4 flex items-center justify-between'>
        <h1 className='text-xl font-semibold'>Summary — {employee.name}</h1>
        <Button variant='outline' onClick={() => navigate('/attendance')}>
          My Attendance
        </Button>
      </header>

      <main className='p-6 space-y-4'>
        {/* Month / Year selectors + inactive toggle */}
        <div className='flex flex-wrap items-center gap-3'>
          <Select value={String(month)} onValueChange={(v) => setMonth(Number(v))}>
            <SelectTrigger className='w-36'>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {MONTHS.map((name, i) => (
                <SelectItem key={i + 1} value={String(i + 1)}>{name}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={String(year)} onValueChange={(v) => setYear(Number(v))}>
            <SelectTrigger className='w-24'>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {YEARS.map((y) => (
                <SelectItem key={y} value={String(y)}>{y}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <label className='flex items-center gap-2 text-sm text-muted-foreground cursor-pointer'>
            <input
              type='checkbox'
              className='h-4 w-4 rounded border-input'
              checked={showInactive}
              onChange={(e) => setShowInactive(e.target.checked)}
            />
            Show inactive employees
          </label>
        </div>

        <SummaryTable employees={visibleEmployees} allEntries={allEntries ?? []} />
      </main>
    </div>
  )
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Run all tests to confirm nothing is broken**

```bash
npm run test:run
```

Expected: all tests passing.

- [ ] **Step 4: Commit**

```bash
git add src/pages/Summary.tsx
git commit -m "feat: add show inactive employees toggle to Summary page"
```

---

## Final Verification

- [ ] Start dev server and manually verify:
  1. Log in as an admin → "View Summary" and "Manage Employees" buttons appear in header
  2. Log in as a non-admin → neither button appears
  3. `/employees` redirects to `/` when accessed as non-admin
  4. Add Employee → new employee appears in list and in Home selector
  5. Edit Employee (name/hours/admin flag) → changes reflect immediately
  6. Deactivate Employee → badge turns Inactive, row muted, no longer in Home selector
  7. Activate Employee → badge returns Active, appears in Home selector again
  8. Cannot deactivate own account (button greyed out)
  9. Summary page shows inactive toggle; inactive employees muted when shown
  10. Unsaved attendance changes → "Manage Employees" triggers guard dialog
