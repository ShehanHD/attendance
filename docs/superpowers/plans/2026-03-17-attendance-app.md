# Workers Attendance App Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a standalone static React app for workers to log daily attendance, backed by MongoDB Atlas Data API, with an admin summary view.

**Architecture:** React 18 + TypeScript + Vite SPA. All data lives in MongoDB Atlas accessed via HTTP Data API (API key in `.env`). No backend server — the built `dist/` folder is served as static files. State management via TanStack Query (server state) + local React state (dirty flag, UI state).

**Tech Stack:** React 18, TypeScript, Vite, React Router v6, TanStack Query, Zod, shadcn/ui, Tailwind CSS, Vitest (tests for pure utils), MongoDB Atlas Data API.

---

## File Map

```
attendance/
  .env.example                          # env var template
  .env                                  # local secrets (gitignored)
  index.html
  vite.config.ts
  tailwind.config.ts
  tsconfig.json
  src/
    main.tsx                            # React root, QueryClientProvider
    App.tsx                             # Router + route definitions
    lib/
      schemas.ts                        # Zod schemas + inferred TS types
      mongoApi.ts                       # Atlas Data API HTTP wrappers
      attendanceUtils.ts               # Pure helpers (holidays, defaults, summary)
    hooks/
      useEmployees.ts                   # TanStack Query: fetch employees
      useClosures.ts                    # TanStack Query: fetch company closures
      useAttendance.ts                  # TanStack Query: fetch + save entries
    pages/
      Home.tsx                          # Employee selector + sessionStorage
      Attendance.tsx                    # Monthly grid page (route guard)
      Summary.tsx                       # Admin summary page (route guard)
    components/
      EmployeeSelector.tsx              # Controlled dropdown of employees
      CellEditor.tsx                    # Popover: type / hours / sickRef
      AttendanceGrid.tsx               # Monthly grid with save + dirty state
      SummaryTable.tsx                 # Read-only all-employees totals table
  src/lib/
    attendanceUtils.test.ts            # Vitest tests for pure helpers
```

---

## Task 1: Project Scaffold

**Files:**
- Create: `vite.config.ts`, `tailwind.config.ts`, `tsconfig.json`, `.env.example`, `src/main.tsx`, `src/App.tsx`

- [ ] **Step 1: Scaffold Vite project**

Run in `C:\Users\Don\Documents\attendance`:
```bash
npm create vite@latest . -- --template react-ts
```
Accept overwrite prompts. Then:
```bash
npm install
```

- [ ] **Step 2: Install dependencies**
```bash
npm install react-router-dom @tanstack/react-query zod
npm install -D vitest @vitest/coverage-v8 jsdom @testing-library/react @testing-library/jest-dom
```

- [ ] **Step 3: Install and configure Tailwind CSS**
```bash
npm install -D tailwindcss postcss autoprefixer
npx tailwindcss init -p
```

Replace `tailwind.config.ts` (or `tailwind.config.js`) content:
```ts
import type { Config } from 'tailwindcss'

export default {
  darkMode: ['class'],
  content: [
    './index.html',
    './src/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {},
  },
  plugins: [],
} satisfies Config
```

Replace `src/index.css` content:
```css
@tailwind base;
@tailwind components;
@tailwind utilities;
```

- [ ] **Step 4: Initialise shadcn/ui**
```bash
npx shadcn@latest init
```
When prompted:
- Style: Default
- Base color: Slate
- CSS variables: Yes

Then add the components we need:
```bash
npx shadcn@latest add button select input label alert dialog toast badge table popover
```

- [ ] **Step 5: Configure Vitest in `vite.config.ts`**
```ts
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test-setup.ts'],
  },
})
```

Create `src/test-setup.ts`:
```ts
import '@testing-library/jest-dom'
```

Add to `tsconfig.json` `compilerOptions`:
```json
{
  "compilerOptions": {
    "baseUrl": ".",
    "paths": { "@/*": ["./src/*"] },
    "types": ["vitest/globals"]
  }
}
```

- [ ] **Step 6: Create `.env.example`**
```
VITE_ATLAS_API_KEY=your_api_key_here
VITE_ATLAS_BASE_URL=https://data.mongodb-api.com/app/YOUR_APP_ID/endpoint/data/v1
VITE_ATLAS_DATABASE=attendance
VITE_ATLAS_DATA_SOURCE=Cluster0
```

Add `.env` to `.gitignore` (ensure it's there — Vite scaffold usually includes it).

- [ ] **Step 7: Wire up `src/main.tsx`**
```tsx
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Toaster } from '@/components/ui/toaster'
import App from './App'
import './index.css'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, staleTime: 30_000 },
  },
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
      <Toaster />
    </QueryClientProvider>
  </StrictMode>
)
```

- [ ] **Step 8: Create placeholder `src/App.tsx`**
```tsx
import { BrowserRouter, Routes, Route } from 'react-router-dom'

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path='/' element={<div>Home placeholder</div>} />
        <Route path='/attendance' element={<div>Attendance placeholder</div>} />
        <Route path='/summary' element={<div>Summary placeholder</div>} />
      </Routes>
    </BrowserRouter>
  )
}
```

- [ ] **Step 9: Verify app starts**
```bash
npm run dev
```
Expected: Vite dev server running, no console errors, browser shows "Home placeholder".

- [ ] **Step 10: Commit**
```bash
git init
git add .
git commit -m "feat: scaffold React TS Vite project with shadcn/ui, TanStack Query, Vitest"
```

---

## Task 2: Zod Schemas & Types

**Files:**
- Create: `src/lib/schemas.ts`

- [ ] **Step 1: Create `src/lib/schemas.ts`**
```ts
import { z } from 'zod'

export const EmployeeSchema = z.object({
  _id: z.string(),
  name: z.string(),
  standardHours: z.number().positive(),
  isAdmin: z.boolean(),
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

- [ ] **Step 2: Verify TypeScript compiles**
```bash
npx tsc --noEmit
```
Expected: no errors.

- [ ] **Step 3: Commit**
```bash
git add src/lib/schemas.ts
git commit -m "feat: add Zod schemas and TypeScript types"
```

---

## Task 3: `attendanceUtils.ts` (TDD)

**Files:**
- Create: `src/lib/attendanceUtils.ts`
- Create: `src/lib/attendanceUtils.test.ts`

- [ ] **Step 1: Write failing tests**

Create `src/lib/attendanceUtils.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import {
  getEasterDate,
  isDisabledDay,
  buildDefaultEntries,
  computeSummary,
} from './attendanceUtils'
import type { Employee, CompanyClosure } from './schemas'

const noClosures: CompanyClosure[] = []

const employee: Employee = {
  _id: 'emp1',
  name: 'Mario Rossi',
  standardHours: 8,
  isAdmin: false,
}

// --- getEasterDate ---
describe('getEasterDate', () => {
  it('returns Easter Sunday for 2024 (March 31)', () => {
    const d = getEasterDate(2024)
    expect(d.getFullYear()).toBe(2024)
    expect(d.getMonth()).toBe(2) // March = 2
    expect(d.getDate()).toBe(31)
  })

  it('returns Easter Sunday for 2025 (April 20)', () => {
    const d = getEasterDate(2025)
    expect(d.getFullYear()).toBe(2025)
    expect(d.getMonth()).toBe(3) // April = 3
    expect(d.getDate()).toBe(20)
  })
})

// --- isDisabledDay ---
describe('isDisabledDay', () => {
  it('disables Saturday', () => {
    // 2026-03-07 is a Saturday
    expect(isDisabledDay(2026, 3, 7, noClosures)).toBe(true)
  })

  it('disables Sunday', () => {
    // 2026-03-08 is a Sunday
    expect(isDisabledDay(2026, 3, 8, noClosures)).toBe(true)
  })

  it('does not disable a regular Monday', () => {
    // 2026-03-09 is a Monday
    expect(isDisabledDay(2026, 3, 9, noClosures)).toBe(false)
  })

  it('disables New Year (Jan 1)', () => {
    expect(isDisabledDay(2026, 1, 1, noClosures)).toBe(true)
  })

  it('disables Ferragosto (Aug 15)', () => {
    expect(isDisabledDay(2026, 8, 15, noClosures)).toBe(true)
  })

  it('disables Easter Monday 2025 (April 21)', () => {
    expect(isDisabledDay(2025, 4, 21, noClosures)).toBe(true)
  })

  it('disables a company closure date', () => {
    const closures: CompanyClosure[] = [
      { _id: '1', date: '2026-03-10', note: null },
    ]
    expect(isDisabledDay(2026, 3, 10, closures)).toBe(true)
  })

  it('does not disable a regular working day with no closure', () => {
    expect(isDisabledDay(2026, 3, 10, noClosures)).toBe(false)
  })
})

// --- buildDefaultEntries ---
describe('buildDefaultEntries', () => {
  it('returns empty array for a future month', () => {
    // Use a month far in the future
    const entries = buildDefaultEntries(employee, 12, 2099, noClosures)
    expect(entries).toHaveLength(0)
  })

  it('generates present entries for each non-disabled day in a past month', () => {
    // March 2020: 31 days, minus weekends (9) minus fixed holidays on weekdays:
    // Mar 2020 has no fixed Italian holidays on a weekday (checking: no match)
    // Working days: 22
    const entries = buildDefaultEntries(employee, 3, 2020, noClosures)
    expect(entries.length).toBeGreaterThan(0)
    expect(entries.every(e => e.type === 'present')).toBe(true)
    expect(entries.every(e => e.hours === employee.standardHours)).toBe(true)
    expect(entries.every(e => e.sickRef === null)).toBe(true)
    expect(entries.every(e => typeof e._id === 'string' && e._id.length > 0)).toBe(true)
    expect(entries.every(e => e.employeeId === employee._id)).toBe(true)
  })

  it('only includes days up to today for the current month', () => {
    const now = new Date()
    const entries = buildDefaultEntries(employee, now.getMonth() + 1, now.getFullYear(), noClosures)
    const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
    expect(entries.every(e => e.date <= today)).toBe(true)
  })
})

// --- computeSummary ---
describe('computeSummary', () => {
  it('counts hours worked for present and absent entries', () => {
    const entries = [
      { _id: '1', employeeId: 'e', date: '2026-03-03', type: 'present' as const, hours: 8, sickRef: null },
      { _id: '2', employeeId: 'e', date: '2026-03-04', type: 'absent' as const, hours: 4, sickRef: null },
    ]
    const s = computeSummary(entries)
    expect(s.hoursWorked).toBe(12)
  })

  it('counts vacation days', () => {
    const entries = [
      { _id: '1', employeeId: 'e', date: '2026-03-03', type: 'vacation' as const, hours: 0, sickRef: null },
      { _id: '2', employeeId: 'e', date: '2026-03-04', type: 'vacation' as const, hours: 0, sickRef: null },
    ]
    const s = computeSummary(entries)
    expect(s.vacationDays).toBe(2)
  })

  it('counts sick days', () => {
    const entries = [
      { _id: '1', employeeId: 'e', date: '2026-03-03', type: 'sick' as const, hours: 0, sickRef: 'DR-001' },
    ]
    const s = computeSummary(entries)
    expect(s.sickDays).toBe(1)
  })

  it('counts tickets only for present days', () => {
    const entries = [
      { _id: '1', employeeId: 'e', date: '2026-03-03', type: 'present' as const, hours: 8, sickRef: null },
      { _id: '2', employeeId: 'e', date: '2026-03-04', type: 'absent' as const, hours: 4, sickRef: null },
      { _id: '3', employeeId: 'e', date: '2026-03-05', type: 'vacation' as const, hours: 0, sickRef: null },
    ]
    const s = computeSummary(entries)
    expect(s.tickets).toBe(1) // only present days get a ticket
  })

  it('returns zeros for empty entries', () => {
    const s = computeSummary([])
    expect(s).toEqual({ hoursWorked: 0, vacationDays: 0, sickDays: 0, tickets: 0 })
  })
})
```

- [ ] **Step 2: Run tests — verify they all fail**
```bash
npx vitest run src/lib/attendanceUtils.test.ts
```
Expected: All tests FAIL with "Cannot find module './attendanceUtils'".

- [ ] **Step 3: Implement `src/lib/attendanceUtils.ts`**
```ts
import type { AttendanceEntry, CompanyClosure, Employee } from './schemas'

// Fixed Italian national holidays (month 1-indexed).
// Easter Sunday is always a Sunday (disabled as weekend).
// Easter Monday is computed dynamically via getEasterDate().
const ITALIAN_PUBLIC_HOLIDAYS: { month: number; day: number }[] = [
  { month: 1, day: 1 },   // Capodanno
  { month: 1, day: 6 },   // Epifania
  { month: 4, day: 25 },  // Festa della Liberazione
  { month: 5, day: 1 },   // Festa dei Lavoratori
  { month: 6, day: 2 },   // Festa della Repubblica
  { month: 8, day: 15 },  // Ferragosto
  { month: 11, day: 1 },  // Ognissanti
  { month: 12, day: 8 },  // Immacolata Concezione
  { month: 12, day: 25 }, // Natale
  { month: 12, day: 26 }, // Santo Stefano
]

// Easter Sunday for the given year using the Anonymous Gregorian algorithm.
// Used to derive Easter Monday: one day after this date.
export function getEasterDate(year: number): Date {
  const a = year % 19
  const b = Math.floor(year / 100)
  const c = year % 100
  const d = Math.floor(b / 4)
  const e = b % 4
  const f = Math.floor((b + 8) / 25)
  const g = Math.floor((b - f + 1) / 3)
  const h = (19 * a + b - d - g + 15) % 30
  const i = Math.floor(c / 4)
  const k = c % 4
  const l = (32 + 2 * e + 2 * i - h - k) % 7
  const m = Math.floor((a + 11 * h + 22 * l) / 451)
  const month = Math.floor((h + l - 7 * m + 114) / 31) // 1-indexed
  const day = ((h + l - 7 * m + 114) % 31) + 1
  return new Date(year, month - 1, day)
}

// Returns true if the day is a weekend, Italian public holiday
// (including Easter Monday), or a company closure.
export function isDisabledDay(
  year: number,
  month: number,
  day: number,
  closures: CompanyClosure[]
): boolean {
  const date = new Date(year, month - 1, day)
  const dow = date.getDay() // 0 = Sunday, 6 = Saturday

  if (dow === 0 || dow === 6) return true

  if (ITALIAN_PUBLIC_HOLIDAYS.some(h => h.month === month && h.day === day)) return true

  // Easter Monday
  const easter = getEasterDate(year)
  const easterMonday = new Date(easter.getTime() + 86_400_000)
  if (
    easterMonday.getFullYear() === year &&
    easterMonday.getMonth() + 1 === month &&
    easterMonday.getDate() === day
  ) return true

  const iso = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
  if (closures.some(c => c.date === iso)) return true

  return false
}

// Generates present-default entries for non-disabled working days.
// Past/current month: caps at today.
// Future months: returns [] (caller shows "No entries yet" message).
// Each entry uses: type="present", hours=employee.standardHours,
// sickRef=null, _id=crypto.randomUUID() (temporary, replaced after save).
export function buildDefaultEntries(
  employee: Employee,
  month: number,
  year: number,
  closures: CompanyClosure[]
): AttendanceEntry[] {
  const now = new Date()
  const currentYear = now.getFullYear()
  const currentMonth = now.getMonth() + 1

  const isFuture =
    year > currentYear || (year === currentYear && month > currentMonth)

  if (isFuture) return []

  const daysInMonth = new Date(year, month, 0).getDate()
  const isCurrentMonth = year === currentYear && month === currentMonth
  const capDay = isCurrentMonth ? now.getDate() : daysInMonth

  const entries: AttendanceEntry[] = []

  for (let day = 1; day <= capDay; day++) {
    if (isDisabledDay(year, month, day, closures)) continue
    const iso = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
    entries.push({
      _id: crypto.randomUUID(),
      employeeId: employee._id,
      date: iso,
      type: 'present',
      hours: employee.standardHours,
      sickRef: null,
    })
  }

  return entries
}

// Computes monthly totals from a set of entries.
export function computeSummary(entries: AttendanceEntry[]): {
  hoursWorked: number
  vacationDays: number
  sickDays: number
  tickets: number
} {
  let hoursWorked = 0
  let vacationDays = 0
  let sickDays = 0
  let tickets = 0

  for (const entry of entries) {
    if (entry.type === 'present' || entry.type === 'absent') {
      hoursWorked += entry.hours
    }
    if (entry.type === 'vacation') vacationDays++
    if (entry.type === 'sick') sickDays++
    if (entry.type === 'present') tickets++
  }

  return { hoursWorked, vacationDays, sickDays, tickets }
}
```

- [ ] **Step 4: Run tests — verify they all pass**
```bash
npx vitest run src/lib/attendanceUtils.test.ts
```
Expected: All tests PASS.

- [ ] **Step 5: Commit**
```bash
git add src/lib/attendanceUtils.ts src/lib/attendanceUtils.test.ts
git commit -m "feat: add attendanceUtils with Italian holiday logic and TDD tests"
```

---

## Task 4: `mongoApi.ts` — Atlas Data API Wrappers

**Files:**
- Create: `src/lib/mongoApi.ts`

- [ ] **Step 1: Create `src/lib/mongoApi.ts`**
```ts
import { z } from 'zod'
import {
  EmployeeSchema,
  AttendanceEntrySchema,
  CompanyClosureSchema,
} from './schemas'
import type { AttendanceEntry, CompanyClosure, Employee } from './schemas'

const BASE_URL = import.meta.env.VITE_ATLAS_BASE_URL as string
const API_KEY = import.meta.env.VITE_ATLAS_API_KEY as string
const DATABASE = import.meta.env.VITE_ATLAS_DATABASE as string
const DATA_SOURCE = import.meta.env.VITE_ATLAS_DATA_SOURCE as string

async function atlasAction<T>(
  action: string,
  collection: string,
  body: Record<string, unknown>,
  schema: z.ZodType<T>
): Promise<T> {
  const res = await fetch(`${BASE_URL}/action/${action}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'api-key': API_KEY,
    },
    body: JSON.stringify({
      dataSource: DATA_SOURCE,
      database: DATABASE,
      collection,
      ...body,
    }),
  })

  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText)
    throw new Error(`Atlas API error ${res.status}: ${text}`)
  }

  const json = await res.json()
  return schema.parse(json)
}

// ── Employees ───────────────────────────────────────────────────────────────

export async function fetchEmployees(): Promise<Employee[]> {
  const result = await atlasAction(
    'find',
    'employees',
    {},
    z.object({ documents: z.array(EmployeeSchema) })
  )
  return result.documents
}

// ── Company Closures ─────────────────────────────────────────────────────────

export async function fetchClosures(): Promise<CompanyClosure[]> {
  const result = await atlasAction(
    'find',
    'company_closures',
    {},
    z.object({ documents: z.array(CompanyClosureSchema) })
  )
  return result.documents
}

// ── Attendance Entries ────────────────────────────────────────────────────────

export async function fetchEntries(
  employeeId: string,
  year: number,
  month: number
): Promise<AttendanceEntry[]> {
  const prefix = `${year}-${String(month).padStart(2, '0')}`
  const result = await atlasAction(
    'find',
    'attendance_entries',
    { filter: { employeeId, date: { $regex: `^${prefix}` } } },
    z.object({ documents: z.array(AttendanceEntrySchema) })
  )
  return result.documents
}

// Full replace: deleteMany then insertMany, scoped to one employee × month.
export async function saveEntries(
  employeeId: string,
  year: number,
  month: number,
  entries: AttendanceEntry[]
): Promise<void> {
  const prefix = `${year}-${String(month).padStart(2, '0')}`

  // Delete all existing entries for this employee × month
  await atlasAction(
    'deleteMany',
    'attendance_entries',
    { filter: { employeeId, date: { $regex: `^${prefix}` } } },
    z.object({ deletedCount: z.number() })
  )

  if (entries.length === 0) return

  // Insert new entries (strip client-side _id — MongoDB will assign real ones)
  const docs = entries.map(({ _id: _ignored, ...rest }) => rest)

  await atlasAction(
    'insertMany',
    'attendance_entries',
    { documents: docs },
    z.object({ insertedIds: z.array(z.string()) })
  )
}

// Fetch all entries for all employees for a given month (used by Summary page)
export async function fetchAllEntriesForMonth(
  year: number,
  month: number
): Promise<AttendanceEntry[]> {
  const prefix = `${year}-${String(month).padStart(2, '0')}`
  const result = await atlasAction(
    'find',
    'attendance_entries',
    { filter: { date: { $regex: `^${prefix}` } } },
    z.object({ documents: z.array(AttendanceEntrySchema) })
  )
  return result.documents
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
git commit -m "feat: add MongoDB Atlas Data API wrappers"
```

---

## Task 5: TanStack Query Hooks

**Files:**
- Create: `src/hooks/useEmployees.ts`
- Create: `src/hooks/useClosures.ts`
- Create: `src/hooks/useAttendance.ts`

- [ ] **Step 1: Create `src/hooks/useEmployees.ts`**
```ts
import { useQuery } from '@tanstack/react-query'
import { fetchEmployees } from '@/lib/mongoApi'

export function useEmployees() {
  return useQuery({
    queryKey: ['employees'],
    queryFn: fetchEmployees,
  })
}
```

- [ ] **Step 2: Create `src/hooks/useClosures.ts`**
```ts
import { useQuery } from '@tanstack/react-query'
import { fetchClosures } from '@/lib/mongoApi'

export function useClosures() {
  return useQuery({
    queryKey: ['closures'],
    queryFn: fetchClosures,
  })
}
```

- [ ] **Step 3: Create `src/hooks/useAttendance.ts`**
```ts
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { fetchEntries, saveEntries } from '@/lib/mongoApi'
import type { AttendanceEntry } from '@/lib/schemas'

export function useAttendanceEntries(
  employeeId: string | null,
  year: number,
  month: number
) {
  return useQuery({
    queryKey: ['attendance', employeeId, year, month],
    queryFn: () => fetchEntries(employeeId!, year, month),
    enabled: employeeId !== null,
  })
}

export function useSaveAttendance() {
  const queryClient = useQueryClient()

  return async (
    employeeId: string,
    year: number,
    month: number,
    entries: AttendanceEntry[]
  ): Promise<AttendanceEntry[]> => {
    await saveEntries(employeeId, year, month, entries)
    // Invalidate and refetch to get server-assigned _ids
    await queryClient.invalidateQueries({
      queryKey: ['attendance', employeeId, year, month],
    })
    const fresh = await queryClient.fetchQuery({
      queryKey: ['attendance', employeeId, year, month],
      queryFn: () => fetchEntries(employeeId, year, month),
    })
    return fresh
  }
}
```

- [ ] **Step 4: Verify TypeScript compiles**
```bash
npx tsc --noEmit
```
Expected: no errors.

- [ ] **Step 5: Commit**
```bash
git add src/hooks/
git commit -m "feat: add TanStack Query hooks for employees, closures, and attendance"
```

---

## Task 6: Router & Session Storage

**Files:**
- Modify: `src/App.tsx`
- Create: `src/pages/Home.tsx` (stub)
- Create: `src/pages/Attendance.tsx` (stub)
- Create: `src/pages/Summary.tsx` (stub)

The selected employee is stored in `sessionStorage` as a JSON-serialised `Employee` object under the key `"selectedEmployee"`. Two helpers manage this.

- [ ] **Step 1: Update `src/App.tsx` with real routes**
```tsx
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import Home from '@/pages/Home'
import Attendance from '@/pages/Attendance'
import Summary from '@/pages/Summary'

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path='/' element={<Home />} />
        <Route path='/attendance' element={<Attendance />} />
        <Route path='/summary' element={<Summary />} />
      </Routes>
    </BrowserRouter>
  )
}
```

- [ ] **Step 2: Create session storage helpers in `src/lib/session.ts`**
```ts
import { EmployeeSchema } from './schemas'
import type { Employee } from './schemas'

const KEY = 'selectedEmployee'

export function getSessionEmployee(): Employee | null {
  try {
    const raw = sessionStorage.getItem(KEY)
    if (!raw) return null
    return EmployeeSchema.parse(JSON.parse(raw))
  } catch {
    return null
  }
}

export function setSessionEmployee(employee: Employee): void {
  sessionStorage.setItem(KEY, JSON.stringify(employee))
}

export function clearSessionEmployee(): void {
  sessionStorage.removeItem(KEY)
}
```

- [ ] **Step 3: Create stub pages**

`src/pages/Home.tsx`:
```tsx
export default function Home() {
  return <div className='p-8'>Home — employee selector coming soon</div>
}
```

`src/pages/Attendance.tsx`:
```tsx
export default function Attendance() {
  return <div className='p-8'>Attendance grid coming soon</div>
}
```

`src/pages/Summary.tsx`:
```tsx
export default function Summary() {
  return <div className='p-8'>Summary coming soon</div>
}
```

- [ ] **Step 4: Verify app runs and routes are reachable**
```bash
npm run dev
```
Navigate to `/`, `/attendance`, `/summary` — each should show its placeholder text.

- [ ] **Step 5: Commit**
```bash
git add src/App.tsx src/lib/session.ts src/pages/
git commit -m "feat: wire React Router routes and session storage helpers"
```

---

## Task 7: Home Page — Employee Selector

**Files:**
- Create: `src/components/EmployeeSelector.tsx`
- Modify: `src/pages/Home.tsx`

- [ ] **Step 1: Create `src/components/EmployeeSelector.tsx`**
```tsx
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Label } from '@/components/ui/label'
import type { Employee } from '@/lib/schemas'

interface Props {
  employees: Employee[]
  value: string | null
  onChange: (employeeId: string) => void
}

export default function EmployeeSelector({ employees, value, onChange }: Props) {
  return (
    <div className='flex flex-col gap-2'>
      <Label htmlFor='employee-select'>Select your name</Label>
      <Select value={value ?? ''} onValueChange={onChange}>
        <SelectTrigger id='employee-select' className='w-64'>
          <SelectValue placeholder='Choose employee…' />
        </SelectTrigger>
        <SelectContent>
          {employees.map(emp => (
            <SelectItem key={emp._id} value={emp._id}>
              {emp.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}
```

- [ ] **Step 2: Implement `src/pages/Home.tsx`**
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

  const handleContinue = () => {
    if (!selectedId || !employees) return
    const employee = employees.find(e => e._id === selectedId)
    if (!employee) return
    setSessionEmployee(employee)
    navigate('/attendance')
  }

  return (
    <div className='flex min-h-screen items-center justify-center bg-background'>
      <div className='flex flex-col gap-6 rounded-lg border bg-card p-8 shadow-sm'>
        <h1 className='text-2xl font-semibold'>Attendance</h1>
        <p className='text-muted-foreground'>Select your name to continue.</p>

        {employees && employees.length === 0 ? (
          <p className='text-muted-foreground'>No employee records found.</p>
        ) : (
          <EmployeeSelector
            employees={employees ?? []}
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

- [ ] **Step 3: Start dev server and manually test**
```bash
npm run dev
```
- Open `/` — should show employee selector (will fail to load from Atlas if `.env` not set up yet — that's fine, error state should render)
- If Atlas is configured: select an employee, click Continue → should navigate to `/attendance`

- [ ] **Step 4: Commit**
```bash
git add src/components/EmployeeSelector.tsx src/pages/Home.tsx
git commit -m "feat: implement Home page with employee selector"
```

---

## Task 8: CellEditor Component

**Files:**
- Create: `src/components/CellEditor.tsx`

- [ ] **Step 1: Create `src/components/CellEditor.tsx`**
```tsx
import { useState, useEffect } from 'react'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import type { AttendanceEntry, AttendanceEntryType } from '@/lib/schemas'

interface Props {
  entry: AttendanceEntry
  onSave: (updated: AttendanceEntry) => void
  children: React.ReactNode  // trigger element
}

const ENTRY_TYPE_LABELS: Record<AttendanceEntryType, string> = {
  present: 'Present',
  absent: 'Absent',
  vacation: 'Vacation',
  sick: 'Sick',
}

export default function CellEditor({ entry, onSave, children }: Props) {
  const [open, setOpen] = useState(false)
  const [type, setType] = useState<AttendanceEntryType>(entry.type)
  const [hours, setHours] = useState(String(entry.hours))
  const [sickRef, setSickRef] = useState(entry.sickRef ?? '')

  // Reset local state when the entry prop changes (e.g. month change)
  useEffect(() => {
    setType(entry.type)
    setHours(String(entry.hours))
    setSickRef(entry.sickRef ?? '')
  }, [entry])

  const showHours = type !== 'vacation' && type !== 'sick'
  const showSickRef = type === 'sick'

  const handleSave = () => {
    onSave({
      ...entry,
      type,
      hours: showHours ? Number(hours) : 0,
      sickRef: showSickRef ? sickRef.trim() || null : null,
    })
    setOpen(false)
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>{children}</PopoverTrigger>
      <PopoverContent className='w-56 space-y-3'>
        <div className='space-y-1'>
          <Label>Type</Label>
          <Select
            value={type}
            onValueChange={v => setType(v as AttendanceEntryType)}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(Object.keys(ENTRY_TYPE_LABELS) as AttendanceEntryType[]).map(t => (
                <SelectItem key={t} value={t}>
                  {ENTRY_TYPE_LABELS[t]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {showHours && (
          <div className='space-y-1'>
            <Label>Hours</Label>
            <Input
              type='number'
              min={0}
              max={24}
              step={0.5}
              value={hours}
              onChange={e => setHours(e.target.value)}
            />
          </div>
        )}

        {showSickRef && (
          <div className='space-y-1'>
            <Label>Sick reference</Label>
            <Input
              value={sickRef}
              onChange={e => setSickRef(e.target.value)}
              placeholder='e.g. DR-001'
            />
          </div>
        )}

        <Button size='sm' className='w-full' onClick={handleSave}>
          Apply
        </Button>
      </PopoverContent>
    </Popover>
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
git add src/components/CellEditor.tsx
git commit -m "feat: add CellEditor popover component"
```

---

## Task 9: AttendanceGrid Component

**Files:**
- Create: `src/components/AttendanceGrid.tsx`

This is the core component. It renders the monthly grid, handles dirty state, and drives the save flow.

- [ ] **Step 1: Create `src/components/AttendanceGrid.tsx`**
```tsx
import { useState, useEffect, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
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
import { Alert, AlertDescription } from '@/components/ui/alert'
import { useToast } from '@/components/ui/use-toast'
import { Badge } from '@/components/ui/badge'
import CellEditor from './CellEditor'
import {
  buildDefaultEntries,
  computeSummary,
  isDisabledDay,
} from '@/lib/attendanceUtils'
import { useAttendanceEntries, useSaveAttendance } from '@/hooks/useAttendance'
import type { AttendanceEntry, CompanyClosure, Employee } from '@/lib/schemas'

interface Props {
  employee: Employee
  closures: CompanyClosure[]
  onDirtyChange: (dirty: boolean) => void
}

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

const currentYear = new Date().getFullYear()
const YEARS = [currentYear - 1, currentYear, currentYear + 1]

const TYPE_COLORS: Record<string, string> = {
  present: 'bg-green-100 text-green-800',
  absent: 'bg-orange-100 text-orange-800',
  vacation: 'bg-blue-100 text-blue-800',
  sick: 'bg-red-100 text-red-800',
}

export default function AttendanceGrid({ employee, closures, onDirtyChange }: Props) {
  const now = new Date()
  const [month, setMonth] = useState(now.getMonth() + 1)
  const [year, setYear] = useState(now.getFullYear())
  const [entries, setEntries] = useState<AttendanceEntry[]>([])
  const [isDirty, setIsDirty] = useState(false)
  const [isSaving, setIsSaving] = useState(false)

  // Pending navigation: { month, year } or null
  const [pendingNav, setPendingNav] = useState<{ month: number; year: number } | null>(null)

  const { toast } = useToast()
  const saveAttendance = useSaveAttendance()

  const { data: fetched, isLoading, isError, refetch } = useAttendanceEntries(
    employee._id,
    year,
    month
  )

  // When fetched data arrives, populate entries (with defaults if empty)
  useEffect(() => {
    if (fetched === undefined) return
    if (fetched.length > 0) {
      setEntries(fetched)
    } else {
      setEntries(buildDefaultEntries(employee, month, year, closures))
    }
    setIsDirty(false)
    onDirtyChange(false)
  }, [fetched]) // eslint-disable-line react-hooks/exhaustive-deps

  const markDirty = useCallback(() => {
    if (!isDirty) {
      setIsDirty(true)
      onDirtyChange(true)
    }
  }, [isDirty, onDirtyChange])

  const handleCellSave = (updated: AttendanceEntry) => {
    setEntries(prev => prev.map(e => e._id === updated._id ? updated : e))
    markDirty()
  }

  const navigateTo = (newMonth: number, newYear: number) => {
    if (isDirty) {
      setPendingNav({ month: newMonth, year: newYear })
    } else {
      setMonth(newMonth)
      setYear(newYear)
    }
  }

  const confirmDiscard = () => {
    if (!pendingNav) return
    setIsDirty(false)
    onDirtyChange(false)
    setMonth(pendingNav.month)
    setYear(pendingNav.year)
    setPendingNav(null)
  }

  const cancelDiscard = () => setPendingNav(null)

  const handleSave = async () => {
    // Pre-save validation
    const missingSickRef = entries.some(
      e => e.type === 'sick' && (!e.sickRef || e.sickRef.trim() === '')
    )
    if (missingSickRef) {
      toast({
        title: 'Sick reference required',
        description: 'All sick entries must have a reference number.',
        variant: 'destructive',
      })
      return
    }

    // Safety assertion
    if (entries.some(e => e.employeeId !== employee._id)) {
      toast({ title: 'Data error', description: 'Entry mismatch detected.', variant: 'destructive' })
      return
    }

    setIsSaving(true)
    try {
      const fresh = await saveAttendance(employee._id, year, month, entries)
      setEntries(fresh)
      setIsDirty(false)
      onDirtyChange(false)
      toast({ title: 'Saved', description: 'Attendance saved successfully.' })
    } catch (err) {
      toast({
        title: 'Save failed',
        description: err instanceof Error ? err.message : 'Unknown error',
        variant: 'destructive',
      })
    } finally {
      setIsSaving(false)
    }
  }

  const daysInMonth = new Date(year, month, 0).getDate()
  const summary = computeSummary(entries)

  if (isLoading) {
    return <p className='text-muted-foreground p-4'>Loading…</p>
  }

  if (isError) {
    return (
      <Alert variant='destructive' className='m-4'>
        <AlertDescription>
          Failed to load attendance.{' '}
          <button onClick={() => refetch()} className='underline'>Retry</button>
        </AlertDescription>
      </Alert>
    )
  }

  return (
    <div className='space-y-4'>
      {/* Month / Year selectors */}
      <div className='flex gap-3 items-center flex-wrap'>
        <Select
          value={String(month)}
          onValueChange={v => navigateTo(Number(v), year)}
        >
          <SelectTrigger className='w-36'>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {MONTHS.map((name, i) => (
              <SelectItem key={i + 1} value={String(i + 1)}>{name}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={String(year)}
          onValueChange={v => navigateTo(month, Number(v))}
        >
          <SelectTrigger className='w-24'>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {YEARS.map(y => (
              <SelectItem key={y} value={String(y)}>{y}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        {isDirty && <Badge variant='outline' className='text-orange-600 border-orange-400'>Unsaved changes</Badge>}
      </div>

      {/* Grid */}
      <div className='overflow-x-auto rounded-md border'>
        <table className='min-w-full text-sm'>
          <thead className='bg-muted'>
            <tr>
              {Array.from({ length: daysInMonth }, (_, i) => i + 1).map(day => {
                const disabled = isDisabledDay(year, month, day, closures)
                return (
                  <th
                    key={day}
                    className={`px-2 py-1 text-center font-medium ${disabled ? 'text-muted-foreground' : ''}`}
                  >
                    {day}
                  </th>
                )
              })}
            </tr>
          </thead>
          <tbody>
            <tr>
              {Array.from({ length: daysInMonth }, (_, i) => i + 1).map(day => {
                const disabled = isDisabledDay(year, month, day, closures)
                const iso = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
                const entry = entries.find(e => e.date === iso)

                if (disabled) {
                  return (
                    <td key={day} className='px-2 py-2 text-center bg-muted/40 text-muted-foreground'>
                      —
                    </td>
                  )
                }

                if (!entry) {
                  // Future month with no entries
                  return <td key={day} className='px-2 py-2 text-center text-muted-foreground'>·</td>
                }

                return (
                  <td key={day} className='px-1 py-1 text-center'>
                    <CellEditor entry={entry} onSave={handleCellSave}>
                      <button
                        className={`w-full rounded px-1 py-0.5 text-xs font-medium ${TYPE_COLORS[entry.type]} hover:opacity-80`}
                      >
                        {entry.type.slice(0, 3).toUpperCase()}
                        {entry.hours > 0 && <span className='ml-0.5 opacity-70'>·{entry.hours}h</span>}
                      </button>
                    </CellEditor>
                  </td>
                )
              })}
            </tr>
          </tbody>
        </table>
      </div>

      {/* No entries message for future month */}
      {entries.length === 0 && (
        <p className='text-muted-foreground text-sm'>No entries yet for this month.</p>
      )}

      {/* Summary */}
      <div className='flex gap-6 text-sm'>
        <span><strong>{summary.hoursWorked}h</strong> worked</span>
        <span><strong>{summary.vacationDays}</strong> vacation</span>
        <span><strong>{summary.sickDays}</strong> sick</span>
        <span><strong>{summary.tickets}</strong> tickets</span>
      </div>

      {/* Save */}
      <Button onClick={handleSave} disabled={isSaving || !isDirty}>
        {isSaving ? 'Saving…' : 'Save'}
      </Button>

      {/* Dirty navigation guard */}
      <AlertDialog open={pendingNav !== null}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Unsaved changes</AlertDialogTitle>
            <AlertDialogDescription>
              You have unsaved changes. Leave without saving?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={cancelDiscard}>Stay</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDiscard}>Leave</AlertDialogAction>
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
git add src/components/AttendanceGrid.tsx
git commit -m "feat: implement AttendanceGrid with dirty state, cell editor, and save"
```

---

## Task 10: Attendance Page

**Files:**
- Modify: `src/pages/Attendance.tsx`

- [ ] **Step 1: Implement `src/pages/Attendance.tsx`**
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
            <Button variant='outline' onClick={handleSummaryClick}>
              View Summary
            </Button>
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

- [ ] **Step 3: Manual smoke test**
```bash
npm run dev
```
- Select an employee on Home → navigate to `/attendance`
- Grid should render; if Atlas is configured, entries load
- Edit a cell → "Unsaved changes" badge appears, Save button activates
- Try changing month with unsaved changes → AlertDialog appears

- [ ] **Step 4: Commit**
```bash
git add src/pages/Attendance.tsx
git commit -m "feat: implement Attendance page with grid, closures, and navigation guards"
```

---

## Task 11: Summary Page

**Files:**
- Create: `src/components/SummaryTable.tsx`
- Modify: `src/pages/Summary.tsx`

- [ ] **Step 1: Create `src/components/SummaryTable.tsx`**
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
        {employees.map(emp => {
          const empEntries = allEntries.filter(e => e.employeeId === emp._id)
          const s = computeSummary(empEntries)
          return (
            <TableRow key={emp._id}>
              <TableCell className='font-medium'>{emp.name}</TableCell>
              <TableCell className='text-right'>{s.hoursWorked}h</TableCell>
              <TableCell className='text-right'>{s.vacationDays}</TableCell>
              <TableCell className='text-right'>{s.sickDays}</TableCell>
              <TableCell className='text-right'>{s.tickets}</TableCell>
            </TableRow>
          )
        })}
      </TableBody>
    </Table>
  )
}
```

- [ ] **Step 2: Implement `src/pages/Summary.tsx`**
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
const currentYear = new Date().getFullYear()
const YEARS = [currentYear - 1, currentYear, currentYear + 1]

export default function Summary() {
  const employee = getSessionEmployee()
  const navigate = useNavigate()

  // Route guards
  if (!employee) return <Navigate to='/' replace />
  if (!employee.isAdmin) return <Navigate to='/' replace />

  const now = new Date()
  const [month, setMonth] = useState(now.getMonth() + 1)
  const [year, setYear] = useState(now.getFullYear())

  const { data: employees, isLoading: empLoading, isError: empError } = useEmployees()

  const {
    data: allEntries,
    isLoading: entriesLoading,
    isError: entriesError,
    refetch,
  } = useQuery({
    queryKey: ['summary-entries', year, month],
    queryFn: () => fetchAllEntriesForMonth(year, month),
  })

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

  return (
    <div className='min-h-screen bg-background'>
      <header className='border-b px-6 py-4 flex items-center justify-between'>
        <h1 className='text-xl font-semibold'>Summary — {employee.name}</h1>
        <Button variant='outline' onClick={() => navigate('/attendance')}>
          My Attendance
        </Button>
      </header>

      <main className='p-6 space-y-4'>
        {/* Month / Year selectors */}
        <div className='flex gap-3'>
          <Select value={String(month)} onValueChange={v => setMonth(Number(v))}>
            <SelectTrigger className='w-36'>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {MONTHS.map((name, i) => (
                <SelectItem key={i + 1} value={String(i + 1)}>{name}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={String(year)} onValueChange={v => setYear(Number(v))}>
            <SelectTrigger className='w-24'>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {YEARS.map(y => (
                <SelectItem key={y} value={String(y)}>{y}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <SummaryTable employees={employees ?? []} allEntries={allEntries ?? []} />
      </main>
    </div>
  )
}
```

- [ ] **Step 3: Verify TypeScript compiles**
```bash
npx tsc --noEmit
```
Expected: no errors.

- [ ] **Step 4: Manual smoke test**
```bash
npm run dev
```
- Log in as an admin employee → `/attendance` shows "View Summary" button
- Click it → navigates to `/summary`
- Non-admin employee → "View Summary" button absent, direct `/summary` URL → redirects to `/`

- [ ] **Step 5: Commit**
```bash
git add src/components/SummaryTable.tsx src/pages/Summary.tsx
git commit -m "feat: implement Summary page and SummaryTable for admin view"
```

---

## Task 12: Build & Final Verification

- [ ] **Step 1: Run all tests**
```bash
npx vitest run
```
Expected: All tests PASS.

- [ ] **Step 2: Run TypeScript check**
```bash
npx tsc --noEmit
```
Expected: no errors.

- [ ] **Step 3: Build for production**
```bash
npm run build
```
Expected: `dist/` folder created, no build errors.

- [ ] **Step 4: Preview production build**
```bash
npm run preview
```
Manually verify:
- Home page loads, employee selector works
- Can navigate to `/attendance` after selecting an employee
- Admin employee sees "View Summary" link
- Non-admin has no summary link; direct `/summary` URL redirects to `/`
- Month/year selectors work within bounds
- Dirty state guard fires on unsaved navigation

- [ ] **Step 5: Final commit**
```bash
git add -A
git commit -m "chore: production build verified"
```

---

## Environment Setup (for deployer)

1. Copy `.env.example` to `.env`
2. Fill in MongoDB Atlas values:
   - `VITE_ATLAS_API_KEY` — from Atlas App Services → API Keys
   - `VITE_ATLAS_BASE_URL` — from Atlas App Services → Data API → URL Endpoint
   - `VITE_ATLAS_DATABASE` — your MongoDB database name (e.g. `attendance`)
   - `VITE_ATLAS_DATA_SOURCE` — your cluster name (e.g. `Cluster0`)
3. In MongoDB Atlas, seed the `employees` collection with at least one document matching the `Employee` schema
4. Run `npm run build` and serve `dist/` with any static file server
