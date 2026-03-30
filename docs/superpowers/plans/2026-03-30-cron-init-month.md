# Cron Month Initialization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Vercel Cron job that automatically fills all active employees' attendance for the new month with default present/vacation entries on the 1st of every month, without overwriting existing data.

**Architecture:** New standalone `api/cron-init-month.ts` endpoint authenticated via `CRON_SECRET` header. On each run it fetches all active employees and company closures, then for each employee with no entries for the current month, inserts working-day defaults (present at `standardHours`, vacation on closure days, skip weekends/Italian holidays). Registered in `vercel.json` cron schedule alongside the existing `send-summary` cron.

**Tech Stack:** TypeScript, Vitest, MongoDB (`mongodb` v7), `@vercel/node`, `zod` (not needed here — no external input to validate beyond the auth header)

---

## File Map

| File | Action | Responsibility |
|------|--------|---------------|
| `api/cron-init-month.ts` | Create | Cron handler: auth, DB queries, entry generation, insert |
| `api/cron-init-month.test.ts` | Create | Vitest unit tests (mocked DB) |
| `vercel.json` | Modify | Add cron schedule entry |

---

### Task 1: Write failing tests

**Files:**
- Create: `api/cron-init-month.test.ts`

- [ ] **Step 1: Create the test file**

```typescript
// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { VercelRequest, VercelResponse } from '@vercel/node'

vi.mock('./_db.js', () => ({
  getDb: vi.fn(),
}))

import { getDb } from './_db.js'
import handler from './cron-init-month.js'

const mockGetDb = vi.mocked(getDb)

function makeRes(): VercelResponse {
  const res = {
    status: vi.fn(),
    json: vi.fn(),
    end: vi.fn(),
  } as unknown as VercelResponse
  ;(res.status as ReturnType<typeof vi.fn>).mockReturnValue(res)
  return res
}

function makeReq(
  overrides: Partial<{ method: string; headers: Record<string, string> }> = {}
): VercelRequest {
  return {
    method: 'POST',
    headers: { authorization: 'Bearer test-secret' },
    ...overrides,
  } as unknown as VercelRequest
}

function makeDb({
  employees = [{ _id: { toString: () => 'emp1' }, standardHours: 8 }] as unknown[],
  closures = [] as unknown[],
  existingCount = 0,
  insertMany = vi.fn().mockResolvedValue({}),
} = {}) {
  const countDocuments = vi.fn().mockResolvedValue(existingCount)
  const collections: Record<string, unknown> = {
    employees: { find: () => ({ toArray: () => Promise.resolve(employees) }) },
    closures: { find: () => ({ toArray: () => Promise.resolve(closures) }) },
    attendance_entries: { countDocuments, insertMany },
  }
  mockGetDb.mockResolvedValue({
    collection: (name: string) => collections[name],
  } as never)
  return { countDocuments, insertMany }
}

// ── Auth ──────────────────────────────────────────────────────────────────────

describe('POST /api/cron-init-month — auth', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.env.CRON_SECRET = 'test-secret'
  })

  it('returns 401 when Authorization header is missing', async () => {
    const res = makeRes()
    await handler(makeReq({ headers: {} }), res)
    expect((res.status as ReturnType<typeof vi.fn>).mock.calls[0][0]).toBe(401)
  })

  it('returns 401 when Authorization header has wrong secret', async () => {
    const res = makeRes()
    await handler(makeReq({ headers: { authorization: 'Bearer wrong' } }), res)
    expect((res.status as ReturnType<typeof vi.fn>).mock.calls[0][0]).toBe(401)
  })

  it('returns 405 for non-POST methods', async () => {
    const res = makeRes()
    await handler(makeReq({ method: 'GET' }), res)
    expect((res.status as ReturnType<typeof vi.fn>).mock.calls[0][0]).toBe(405)
  })
})

// ── Initialization logic ──────────────────────────────────────────────────────

describe('POST /api/cron-init-month — initialization logic', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.env.CRON_SECRET = 'test-secret'
  })

  it('skips employees that already have entries and returns skipped count', async () => {
    const { insertMany } = makeDb({ existingCount: 5 })
    const res = makeRes()
    await handler(makeReq(), res)
    expect(insertMany).not.toHaveBeenCalled()
    const body = (res.json as ReturnType<typeof vi.fn>).mock.calls[0][0] as {
      initialized: number
      skipped: number
    }
    expect(body.skipped).toBe(1)
    expect(body.initialized).toBe(0)
  })

  it('inserts entries for employees with no existing data', async () => {
    const { insertMany } = makeDb({ existingCount: 0 })
    const res = makeRes()
    await handler(makeReq(), res)
    expect(insertMany).toHaveBeenCalledOnce()
    const body = (res.json as ReturnType<typeof vi.fn>).mock.calls[0][0] as {
      initialized: number
      skipped: number
    }
    expect(body.initialized).toBe(1)
    expect(body.skipped).toBe(0)
  })

  it('inserted entries have correct structure', async () => {
    const { insertMany } = makeDb({ existingCount: 0 })
    await handler(makeReq(), makeRes())
    const docs = insertMany.mock.calls[0][0] as Array<Record<string, unknown>>
    expect(docs.length).toBeGreaterThan(0)
    const first = docs[0]
    expect(first.employeeId).toBe('emp1')
    expect(typeof first.date).toBe('string')
    expect(first.date).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    expect(['present', 'vacation']).toContain(first.type)
    expect(typeof first.hours).toBe('number')
    expect(first.sickRef).toBeNull()
  })

  it('marks company closure days as vacation with 0 hours', async () => {
    const now = new Date()
    const year = now.getUTCFullYear()
    const month = now.getUTCMonth() + 1
    const pad = (n: number) => String(n).padStart(2, '0')
    const closureDate = `${year}-${pad(month)}-02`
    const { insertMany } = makeDb({
      existingCount: 0,
      closures: [{ date: closureDate, endDate: closureDate, note: null }],
    })
    await handler(makeReq(), makeRes())
    const docs = insertMany.mock.calls[0][0] as Array<Record<string, unknown>>
    const closureEntry = docs.find(d => d.date === closureDate)
    // Only assert if day 2 was not a weekend/public holiday (guard for edge months)
    if (closureEntry) {
      expect(closureEntry.type).toBe('vacation')
      expect(closureEntry.hours).toBe(0)
    }
  })

  it('returns 500 when DB throws', async () => {
    mockGetDb.mockRejectedValue(new Error('db error'))
    const res = makeRes()
    await handler(makeReq(), res)
    expect((res.status as ReturnType<typeof vi.fn>).mock.calls[0][0]).toBe(500)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd C:/Users/Don/Documents/attendance && npx vitest run api/cron-init-month.test.ts
```

Expected output: FAIL — `Cannot find module './cron-init-month.js'`

---

### Task 2: Implement `api/cron-init-month.ts`

**Files:**
- Create: `api/cron-init-month.ts`

- [ ] **Step 1: Create the implementation file**

```typescript
import { ObjectId } from 'mongodb'
import type { VercelRequest, VercelResponse } from '@vercel/node'
import { getDb } from './_db.js'

// Fixed Italian national holidays + Milan patron saint (month 1-indexed).
const ITALIAN_PUBLIC_HOLIDAYS: { month: number; day: number }[] = [
  { month: 1,  day: 1  }, // Capodanno
  { month: 1,  day: 6  }, // Epifania
  { month: 4,  day: 25 }, // Festa della Liberazione
  { month: 5,  day: 1  }, // Festa dei Lavoratori
  { month: 6,  day: 2  }, // Festa della Repubblica
  { month: 8,  day: 15 }, // Ferragosto
  { month: 11, day: 1  }, // Ognissanti
  { month: 12, day: 7  }, // Sant'Ambrogio (Milan)
  { month: 12, day: 8  }, // Immacolata Concezione
  { month: 12, day: 25 }, // Natale
  { month: 12, day: 26 }, // Santo Stefano
]

// Easter Monday date for the given year (Anonymous Gregorian algorithm).
function getEasterMonday(year: number): { month: number; day: number } {
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
  const easterMonth = Math.floor((h + l - 7 * m + 114) / 31)
  const easterDay = ((h + l - 7 * m + 114) % 31) + 1
  const monday = new Date(year, easterMonth - 1, easterDay + 1)
  return { month: monday.getMonth() + 1, day: monday.getDate() }
}

function isDisabledDay(year: number, month: number, day: number): boolean {
  const dow = new Date(year, month - 1, day).getDay() // 0=Sun, 6=Sat
  if (dow === 0 || dow === 6) return true
  if (ITALIAN_PUBLIC_HOLIDAYS.some(h => h.month === month && h.day === day)) return true
  const em = getEasterMonday(year)
  if (em.month === month && em.day === day) return true
  return false
}

interface Closure {
  date: string
  endDate?: string
}

function isCompanyClosure(year: number, month: number, day: number, closures: Closure[]): boolean {
  const iso = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
  return closures.some(c => iso >= c.date && iso <= (c.endDate ?? c.date))
}

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' })
    return
  }

  const secret = process.env.CRON_SECRET
  if (!secret || req.headers['authorization'] !== `Bearer ${secret}`) {
    res.status(401).json({ error: 'Unauthorized' })
    return
  }

  const now = new Date()
  const year = now.getUTCFullYear()
  const month = now.getUTCMonth() + 1
  const prefix = `${year}-${String(month).padStart(2, '0')}-`

  try {
    const db = await getDb()

    const employees = await db
      .collection('employees')
      .find({ isActive: { $ne: false } })
      .toArray() as Array<{ _id: { toString(): string }; standardHours: number }>

    const closures = await db
      .collection('closures')
      .find({})
      .toArray() as Closure[]

    let initialized = 0
    let skipped = 0
    const daysInMonth = new Date(year, month, 0).getDate()

    for (const emp of employees) {
      const employeeId = emp._id.toString()

      const existing = await db
        .collection('attendance_entries')
        .countDocuments({ employeeId, date: { $regex: `^${prefix}` } })

      if (existing > 0) {
        skipped++
        continue
      }

      const docs = []
      for (let day = 1; day <= daysInMonth; day++) {
        if (isDisabledDay(year, month, day)) continue
        const iso = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
        const isClosure = isCompanyClosure(year, month, day, closures)
        docs.push({
          _id: new ObjectId(),
          employeeId,
          date: iso,
          type: isClosure ? 'vacation' : 'present',
          hours: isClosure ? 0 : emp.standardHours,
          sickRef: null,
        })
      }

      if (docs.length > 0) {
        await db.collection('attendance_entries').insertMany(docs)
      }
      initialized++
    }

    res.status(200).json({ initialized, skipped })
  } catch {
    res.status(500).json({ error: 'Internal server error' })
  }
}
```

- [ ] **Step 2: Run tests to verify they pass**

```bash
cd C:/Users/Don/Documents/attendance && npx vitest run api/cron-init-month.test.ts
```

Expected output: All tests PASS

- [ ] **Step 3: Commit**

```bash
cd C:/Users/Don/Documents/attendance && git add api/cron-init-month.ts api/cron-init-month.test.ts && git commit -m "feat: add cron endpoint to auto-init current month for all active employees"
```

---

### Task 3: Register cron schedule in `vercel.json`

**Files:**
- Modify: `vercel.json`

- [ ] **Step 1: Add the cron entry**

Replace the contents of `vercel.json` with:

```json
{
  "framework": "vite",
  "rewrites": [{ "source": "/((?!api/|@)[^.]*)", "destination": "/index.html" }],
  "crons": [
    {
      "path": "/api/send-summary",
      "schedule": "0 8 28-31 * *"
    },
    {
      "path": "/api/cron-init-month",
      "schedule": "0 0 1 * *"
    }
  ]
}
```

- [ ] **Step 2: Run full test suite to confirm nothing is broken**

```bash
cd C:/Users/Don/Documents/attendance && npx vitest run
```

Expected output: All tests PASS

- [ ] **Step 3: Commit**

```bash
cd C:/Users/Don/Documents/attendance && git add vercel.json && git commit -m "feat: schedule cron-init-month on 1st of every month at 00:00 UTC"
```

---

## Post-Deploy Checklist

After deploying to Vercel:

1. **Add `CRON_SECRET` env var** in Vercel dashboard → Project → Settings → Environment Variables. Use a strong random value:
   ```bash
   openssl rand -hex 32
   ```

2. **Redeploy** the project so the new env var takes effect.

3. **Manual test** the endpoint:
   ```bash
   curl -X POST https://<your-app>.vercel.app/api/cron-init-month \
     -H "Authorization: Bearer <your-CRON_SECRET>"
   ```
   Expected response: `{"initialized": N, "skipped": M}`
