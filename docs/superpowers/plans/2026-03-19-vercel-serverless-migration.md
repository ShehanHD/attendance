# Vercel Serverless Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the deprecated MongoDB Atlas Data API with three Vercel serverless functions so all DB operations work again, with credentials kept server-side.

**Architecture:** Three `api/*.ts` handlers (employees, closures, entries) backed by a shared cached `MongoClient` in `api/_db.ts`. The frontend `src/lib/mongoApi.ts` is rewritten to call `/api/*` instead of the dead Atlas URL; all five exported function signatures stay unchanged so no hooks or components need touching.

**Tech Stack:** Vercel serverless functions (`@vercel/node`), MongoDB Node.js driver (`mongodb`), Vite + React 19, Zod 4, Vitest

---

## File Map

| Action | File | Responsibility |
|--------|------|----------------|
| Create | `api/_db.ts` | Cached `MongoClient`; `getDb()` helper |
| Create | `api/employees.ts` | `GET /api/employees` handler |
| Create | `api/closures.ts` | `GET /api/closures` handler |
| Create | `api/entries.ts` | `GET` + `POST /api/entries` handler |
| Create | `api/employees.test.ts` | Unit tests for employees handler |
| Create | `api/closures.test.ts` | Unit tests for closures handler |
| Create | `api/entries.test.ts` | Unit tests for entries handler |
| Create | `src/lib/mongoApi.test.ts` | Unit tests for rewritten frontend client |
| Create | `tsconfig.api.json` | TypeScript config for `api/` (Node16 resolution) |
| Create | `vercel.json` | Vercel build config + SPA fallback rewrite |
| Modify | `src/lib/mongoApi.ts` | Rewrite to call `/api/*` instead of Atlas |
| Modify | `vite.config.ts` | Remove dead `/api` proxy block |
| Modify | `tsconfig.json` | Add `tsconfig.api.json` project reference |
| Modify | `package.json` | Update `"dev"` script to `"vercel dev"` |
| Modify | `.env.example` | Replace `VITE_ATLAS_*` with `MONGODB_*` placeholders |

---

## Task 1: Install dependencies and scaffold config files

**Files:**
- Modify: `package.json`
- Create: `vercel.json`
- Create: `tsconfig.api.json`
- Modify: `tsconfig.json`
- Modify: `.env.example`

- [ ] **Step 1: Install the MongoDB driver and Vercel types**

```bash
npm install mongodb
npm install -D @vercel/node
```

Expected: both packages appear in `package.json`. `npm install` exits 0.

- [ ] **Step 2: Create `vercel.json`**

```json
{
  "framework": "vite",
  "rewrites": [{ "source": "/((?!api/).*)", "destination": "/index.html" }]
}
```

Save to: `vercel.json` (project root)

- [ ] **Step 3: Create `tsconfig.api.json`**

```json
{
  "compilerOptions": {
    "tsBuildInfoFile": "./node_modules/.tmp/tsconfig.api.tsbuildinfo",
    "target": "ES2023",
    "lib": ["ES2023"],
    "module": "Node16",
    "moduleResolution": "Node16",
    "types": ["node"],
    "skipLibCheck": true,
    "noEmit": true,
    "verbatimModuleSyntax": true,
    "moduleDetection": "force",
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true,
    "noUncheckedSideEffectImports": true
  },
  "include": ["api"]
}
```

Save to: `tsconfig.api.json` (project root)

- [ ] **Step 4: Add `tsconfig.api.json` as a project reference in `tsconfig.json`**

Current `tsconfig.json`:
```json
{
  "files": [],
  "references": [
    { "path": "./tsconfig.app.json" },
    { "path": "./tsconfig.node.json" }
  ],
  "compilerOptions": {
    "baseUrl": ".",
    "paths": { "@/*": ["./src/*"] }
  }
}
```

Updated `tsconfig.json`:
```json
{
  "files": [],
  "references": [
    { "path": "./tsconfig.app.json" },
    { "path": "./tsconfig.node.json" },
    { "path": "./tsconfig.api.json" }
  ],
  "compilerOptions": {
    "baseUrl": ".",
    "paths": { "@/*": ["./src/*"] }
  }
}
```

- [ ] **Step 5: Update `package.json` dev script**

Change `"dev": "vite"` to `"dev": "vercel dev"`.

- [ ] **Step 6: Update `.env.example`**

Replace the entire file contents with:
```
MONGODB_URI=mongodb+srv://username:password@cluster.mongodb.net/
MONGODB_DATABASE=attendance
```

(No real credentials — placeholder strings only.)

- [ ] **Step 7: Commit**

```bash
git add package.json package-lock.json vercel.json tsconfig.api.json tsconfig.json .env.example
git commit -m "chore: add Vercel + MongoDB deps, scaffold config files"
```

---

## Task 2: Create `api/_db.ts` — shared MongoDB client

**Files:**
- Create: `api/_db.ts`

- [ ] **Step 1: Create `api/_db.ts`**

```ts
import { MongoClient, type Db } from 'mongodb'

let client: MongoClient | null = null

export async function getDb(): Promise<Db> {
  const uri = process.env.MONGODB_URI
  const database = process.env.MONGODB_DATABASE
  if (!uri) throw new Error('MONGODB_URI environment variable is not set')
  if (!database) throw new Error('MONGODB_DATABASE environment variable is not set')
  if (!client) {
    client = new MongoClient(uri)
    await client.connect()
  }
  return client.db(database)
}
```

Note: the underscore prefix (`_db.ts`) prevents Vercel from exposing this file as an HTTP route.

- [ ] **Step 2: Verify it type-checks**

```bash
npx tsc -b tsconfig.api.json --noEmit
```

Expected: exits 0.

- [ ] **Step 3: Commit**

```bash
git add api/_db.ts
git commit -m "feat: add shared MongoDB client for Vercel functions"
```

---

## Task 3: `GET /api/employees` (TDD)

**Files:**
- Create: `api/employees.test.ts`
- Create: `api/employees.ts`

- [ ] **Step 1: Write the failing test**

Create `api/employees.test.ts`:

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
  } as unknown as VercelResponse
  ;(res.status as ReturnType<typeof vi.fn>).mockReturnValue(res)
  return res
}

function makeReq(method = 'GET'): VercelRequest {
  return { method } as VercelRequest
}

describe('GET /api/employees', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns employees with _id serialized to string', async () => {
    const objectId = { toString: () => 'abc123' }
    mockGetDb.mockResolvedValue({
      collection: () => ({
        find: () => ({ toArray: async () => [{ _id: objectId, name: 'Alice', standardHours: 8, isAdmin: false }] }),
      }),
    } as never)

    const req = makeReq()
    const res = makeRes()
    await handler(req, res)

    expect((res.status as ReturnType<typeof vi.fn>).mock.calls[0][0]).toBe(200)
    expect((res.json as ReturnType<typeof vi.fn>).mock.calls[0][0]).toEqual({
      employees: [{ _id: 'abc123', name: 'Alice', standardHours: 8, isAdmin: false }],
    })
  })

  it('returns 405 for non-GET methods', async () => {
    const req = makeReq('POST')
    const res = makeRes()
    await handler(req, res)

    expect((res.status as ReturnType<typeof vi.fn>).mock.calls[0][0]).toBe(405)
  })

  it('returns 500 when getDb throws', async () => {
    mockGetDb.mockRejectedValue(new Error('connection failed'))
    const req = makeReq()
    const res = makeRes()
    await handler(req, res)

    expect((res.status as ReturnType<typeof vi.fn>).mock.calls[0][0]).toBe(500)
  })
})
```

- [ ] **Step 2: Run test — expect FAIL (handler does not exist yet)**

```bash
npx vitest run api/employees.test.ts
```

Expected: FAIL — `Cannot find module './employees.js'`

- [ ] **Step 3: Implement `api/employees.ts`**

```ts
import type { VercelRequest, VercelResponse } from '@vercel/node'
import { getDb } from './_db.js'

export default async function handler(
  req: VercelRequest,
  res: VercelResponse
): Promise<void> {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' })
    return
  }
  try {
    const db = await getDb()
    const docs = await db.collection('employees').find({}).toArray()
    const employees = docs.map(({ _id, ...rest }) => ({ ...rest, _id: _id.toString() }))
    res.status(200).json({ employees })
  } catch {
    res.status(500).json({ error: 'Internal server error' })
  }
}
```

- [ ] **Step 4: Run test — expect PASS**

```bash
npx vitest run api/employees.test.ts
```

Expected: 3 tests pass.

- [ ] **Step 5: Commit**

```bash
git add api/employees.ts api/employees.test.ts
git commit -m "feat: add GET /api/employees serverless function"
```

---

## Task 4: `GET /api/closures` (TDD)

**Files:**
- Create: `api/closures.test.ts`
- Create: `api/closures.ts`

- [ ] **Step 1: Write the failing test**

Create `api/closures.test.ts`:

```ts
// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { VercelRequest, VercelResponse } from '@vercel/node'

vi.mock('./_db.js', () => ({
  getDb: vi.fn(),
}))

import { getDb } from './_db.js'
import handler from './closures.js'

const mockGetDb = vi.mocked(getDb)

function makeRes() {
  const res = {
    status: vi.fn(),
    json: vi.fn(),
  } as unknown as VercelResponse
  ;(res.status as ReturnType<typeof vi.fn>).mockReturnValue(res)
  return res
}

function makeReq(method = 'GET'): VercelRequest {
  return { method } as VercelRequest
}

describe('GET /api/closures', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns closures with _id serialized to string', async () => {
    const objectId = { toString: () => 'clo456' }
    mockGetDb.mockResolvedValue({
      collection: () => ({
        find: () => ({ toArray: async () => [{ _id: objectId, date: '2026-01-01', note: 'New Year' }] }),
      }),
    } as never)

    const req = makeReq()
    const res = makeRes()
    await handler(req, res)

    expect((res.status as ReturnType<typeof vi.fn>).mock.calls[0][0]).toBe(200)
    expect((res.json as ReturnType<typeof vi.fn>).mock.calls[0][0]).toEqual({
      closures: [{ _id: 'clo456', date: '2026-01-01', note: 'New Year' }],
    })
  })

  it('returns 405 for non-GET methods', async () => {
    const req = makeReq('POST')
    const res = makeRes()
    await handler(req, res)

    expect((res.status as ReturnType<typeof vi.fn>).mock.calls[0][0]).toBe(405)
  })

  it('returns 500 when getDb throws', async () => {
    mockGetDb.mockRejectedValue(new Error('timeout'))
    const req = makeReq()
    const res = makeRes()
    await handler(req, res)

    expect((res.status as ReturnType<typeof vi.fn>).mock.calls[0][0]).toBe(500)
  })
})
```

- [ ] **Step 2: Run test — expect FAIL**

```bash
npx vitest run api/closures.test.ts
```

Expected: FAIL — `Cannot find module './closures.js'`

- [ ] **Step 3: Implement `api/closures.ts`**

```ts
import type { VercelRequest, VercelResponse } from '@vercel/node'
import { getDb } from './_db.js'

export default async function handler(
  req: VercelRequest,
  res: VercelResponse
): Promise<void> {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' })
    return
  }
  try {
    const db = await getDb()
    const docs = await db.collection('company_closures').find({}).toArray()
    const closures = docs.map(({ _id, ...rest }) => ({ ...rest, _id: _id.toString() }))
    res.status(200).json({ closures })
  } catch {
    res.status(500).json({ error: 'Internal server error' })
  }
}
```

- [ ] **Step 4: Run test — expect PASS**

```bash
npx vitest run api/closures.test.ts
```

Expected: 3 tests pass.

- [ ] **Step 5: Commit**

```bash
git add api/closures.ts api/closures.test.ts
git commit -m "feat: add GET /api/closures serverless function"
```

---

## Task 5: `GET` + `POST /api/entries` (TDD)

**Files:**
- Create: `api/entries.test.ts`
- Create: `api/entries.ts`

- [ ] **Step 1: Write the failing test**

Create `api/entries.test.ts`:

```ts
// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { VercelRequest, VercelResponse } from '@vercel/node'

vi.mock('./_db.js', () => ({
  getDb: vi.fn(),
}))

import { getDb } from './_db.js'
import handler from './entries.js'

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

function makeGetReq(query: Record<string, string>): VercelRequest {
  return { method: 'GET', query } as unknown as VercelRequest
}

function makePostReq(body: unknown): VercelRequest {
  return { method: 'POST', body } as unknown as VercelRequest
}

const mockEntry = {
  _id: { toString: () => 'ent789' },
  employeeId: 'emp1',
  date: '2026-03-01',
  type: 'present',
  hours: 8,
  sickRef: null,
}

describe('GET /api/entries — single employee', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns entries filtered by employeeId + month, _id as string', async () => {
    const toArray = vi.fn().mockResolvedValue([mockEntry])
    mockGetDb.mockResolvedValue({
      collection: () => ({ find: () => ({ toArray }) }),
    } as never)

    const req = makeGetReq({ employeeId: 'emp1', year: '2026', month: '3' })
    const res = makeRes()
    await handler(req, res)

    expect((res.status as ReturnType<typeof vi.fn>).mock.calls[0][0]).toBe(200)
    const body = (res.json as ReturnType<typeof vi.fn>).mock.calls[0][0]
    expect(body.entries[0]._id).toBe('ent789')
    expect(body.entries[0].employeeId).toBe('emp1')
  })

  it('returns 400 when year is missing', async () => {
    const req = makeGetReq({ employeeId: 'emp1', month: '3' })
    const res = makeRes()
    await handler(req, res)

    expect((res.status as ReturnType<typeof vi.fn>).mock.calls[0][0]).toBe(400)
  })

  it('returns 400 when month is missing', async () => {
    const req = makeGetReq({ employeeId: 'emp1', year: '2026' })
    const res = makeRes()
    await handler(req, res)

    expect((res.status as ReturnType<typeof vi.fn>).mock.calls[0][0]).toBe(400)
  })
})

describe('GET /api/entries — all employees (Summary page)', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns all entries for the month when no employeeId', async () => {
    const toArray = vi.fn().mockResolvedValue([mockEntry])
    mockGetDb.mockResolvedValue({
      collection: () => ({ find: () => ({ toArray }) }),
    } as never)

    const req = makeGetReq({ year: '2026', month: '3' })
    const res = makeRes()
    await handler(req, res)

    expect((res.status as ReturnType<typeof vi.fn>).mock.calls[0][0]).toBe(200)
    const body = (res.json as ReturnType<typeof vi.fn>).mock.calls[0][0]
    expect(body.entries).toHaveLength(1)
  })
})

describe('POST /api/entries', () => {
  beforeEach(() => vi.clearAllMocks())

  it('deletes then inserts, stripping _id from entries', async () => {
    const deleteMany = vi.fn().mockResolvedValue({ deletedCount: 1 })
    const insertMany = vi.fn().mockResolvedValue({ insertedCount: 1 })
    mockGetDb.mockResolvedValue({
      collection: () => ({ deleteMany, insertMany }),
    } as never)

    const entry = { _id: 'old-id', employeeId: 'emp1', date: '2026-03-01', type: 'present', hours: 8, sickRef: null }
    const req = makePostReq({ employeeId: 'emp1', year: 2026, month: 3, entries: [entry] })
    const res = makeRes()
    await handler(req, res)

    expect(deleteMany).toHaveBeenCalledOnce()
    expect(insertMany).toHaveBeenCalledOnce()
    // _id must be stripped before insert
    const insertedDocs = insertMany.mock.calls[0][0] as unknown[]
    expect((insertedDocs[0] as Record<string, unknown>)['_id']).toBeUndefined()
    expect((res.status as ReturnType<typeof vi.fn>).mock.calls[0][0]).toBe(204)
  })

  it('skips insertMany when entries array is empty', async () => {
    const deleteMany = vi.fn().mockResolvedValue({ deletedCount: 0 })
    const insertMany = vi.fn()
    mockGetDb.mockResolvedValue({
      collection: () => ({ deleteMany, insertMany }),
    } as never)

    const req = makePostReq({ employeeId: 'emp1', year: 2026, month: 3, entries: [] })
    const res = makeRes()
    await handler(req, res)

    expect(deleteMany).toHaveBeenCalledOnce()
    expect(insertMany).not.toHaveBeenCalled()
    expect((res.status as ReturnType<typeof vi.fn>).mock.calls[0][0]).toBe(204)
  })

  it('returns 400 when body is missing required fields', async () => {
    const req = makePostReq({ entries: [] }) // missing employeeId, year, month
    const res = makeRes()
    await handler(req, res)

    expect((res.status as ReturnType<typeof vi.fn>).mock.calls[0][0]).toBe(400)
  })

  it('returns 500 when deleteMany throws', async () => {
    mockGetDb.mockResolvedValue({
      collection: () => ({ deleteMany: vi.fn().mockRejectedValue(new Error('db error')) }),
    } as never)

    const req = makePostReq({ employeeId: 'emp1', year: 2026, month: 3, entries: [] })
    const res = makeRes()
    await handler(req, res)

    expect((res.status as ReturnType<typeof vi.fn>).mock.calls[0][0]).toBe(500)
  })

  it('returns 405 for unsupported methods', async () => {
    const req = { method: 'DELETE', query: {}, body: {} } as unknown as VercelRequest
    const res = makeRes()
    await handler(req, res)

    expect((res.status as ReturnType<typeof vi.fn>).mock.calls[0][0]).toBe(405)
  })
})
```

- [ ] **Step 2: Run test — expect FAIL**

```bash
npx vitest run api/entries.test.ts
```

Expected: FAIL — `Cannot find module './entries.js'`

- [ ] **Step 3: Implement `api/entries.ts`**

```ts
import type { VercelRequest, VercelResponse } from '@vercel/node'
import { getDb } from './_db.js'

export default async function handler(
  req: VercelRequest,
  res: VercelResponse
): Promise<void> {
  if (req.method === 'GET') {
    await handleGet(req, res)
  } else if (req.method === 'POST') {
    await handlePost(req, res)
  } else {
    res.status(405).json({ error: 'Method not allowed' })
  }
}

async function handleGet(req: VercelRequest, res: VercelResponse): Promise<void> {
  const { employeeId, year, month } = req.query as Record<string, string | undefined>

  if (!year || !month) {
    res.status(400).json({ error: 'year and month query params are required' })
    return
  }

  const prefix = `${year}-${String(month).padStart(2, '0')}`
  const filter: Record<string, unknown> = { date: { $regex: `^${prefix}` } }
  if (employeeId) filter['employeeId'] = employeeId

  try {
    const db = await getDb()
    const docs = await db.collection('attendance_entries').find(filter).toArray()
    const entries = docs.map(({ _id, ...rest }) => ({ ...rest, _id: _id.toString() }))
    res.status(200).json({ entries })
  } catch {
    res.status(500).json({ error: 'Internal server error' })
  }
}

async function handlePost(req: VercelRequest, res: VercelResponse): Promise<void> {
  const { employeeId, year, month, entries } = req.body as {
    employeeId?: string
    year?: number
    month?: number
    entries?: Array<Record<string, unknown>>
  }

  if (!employeeId || year == null || month == null || !Array.isArray(entries)) {
    res.status(400).json({ error: 'employeeId, year, month, and entries are required' })
    return
  }

  const prefix = `${year}-${String(month).padStart(2, '0')}`

  try {
    const db = await getDb()
    const col = db.collection('attendance_entries')

    await col.deleteMany({ employeeId, date: { $regex: `^${prefix}` } })

    if (entries.length > 0) {
      // Strip client-side _id — MongoDB assigns real ObjectIds
      const docs = entries.map(({ _id: _, ...rest }) => rest)
      await col.insertMany(docs)
    }

    res.status(204).end()
  } catch {
    res.status(500).json({ error: 'Internal server error' })
  }
}
```

- [ ] **Step 4: Run test — expect PASS**

```bash
npx vitest run api/entries.test.ts
```

Expected: 9 tests pass.

- [ ] **Step 5: Commit**

```bash
git add api/entries.ts api/entries.test.ts
git commit -m "feat: add GET + POST /api/entries serverless function"
```

---

## Task 6: Rewrite `src/lib/mongoApi.ts` (TDD)

**Files:**
- Create: `src/lib/mongoApi.test.ts`
- Modify: `src/lib/mongoApi.ts`

- [ ] **Step 1: Write the failing test**

Create `src/lib/mongoApi.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  fetchEmployees,
  fetchClosures,
  fetchEntries,
  saveEntries,
  fetchAllEntriesForMonth,
} from './mongoApi'
import type { Employee, CompanyClosure, AttendanceEntry } from './schemas'

const mockEmployee: Employee = { _id: 'e1', name: 'Alice', standardHours: 8, isAdmin: false }
const mockClosure: CompanyClosure = { _id: 'c1', date: '2026-01-01', note: null }
const mockEntry: AttendanceEntry = {
  _id: 'en1',
  employeeId: 'e1',
  date: '2026-03-01',
  type: 'present',
  hours: 8,
  sickRef: null,
}

function mockFetch(body: unknown, status = 200) {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({
      ok: status >= 200 && status < 300,
      status,
      json: async () => body,
      text: async () => JSON.stringify(body),
      statusText: 'OK',
    })
  )
}

describe('fetchEmployees', () => {
  beforeEach(() => vi.unstubAllGlobals())

  it('calls GET /api/employees and returns employees', async () => {
    mockFetch({ employees: [mockEmployee] })
    const result = await fetchEmployees()
    expect(result).toEqual([mockEmployee])
    const call = vi.mocked(fetch).mock.calls[0]
    expect(call[0]).toBe('/api/employees')
  })

  it('throws on non-2xx response', async () => {
    mockFetch({ error: 'Internal server error' }, 500)
    await expect(fetchEmployees()).rejects.toThrow('500')
  })
})

describe('fetchClosures', () => {
  beforeEach(() => vi.unstubAllGlobals())

  it('calls GET /api/closures and returns closures', async () => {
    mockFetch({ closures: [mockClosure] })
    const result = await fetchClosures()
    expect(result).toEqual([mockClosure])
    const call = vi.mocked(fetch).mock.calls[0]
    expect(call[0]).toBe('/api/closures')
  })
})

describe('fetchEntries', () => {
  beforeEach(() => vi.unstubAllGlobals())

  it('calls GET /api/entries with employeeId+year+month params', async () => {
    mockFetch({ entries: [mockEntry] })
    const result = await fetchEntries('e1', 2026, 3)
    expect(result).toEqual([mockEntry])
    const url = vi.mocked(fetch).mock.calls[0][0] as string
    expect(url).toContain('/api/entries')
    expect(url).toContain('employeeId=e1')
    expect(url).toContain('year=2026')
    expect(url).toContain('month=3')
  })
})

describe('saveEntries', () => {
  beforeEach(() => vi.unstubAllGlobals())

  it('calls POST /api/entries with correct body and resolves on 204', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, status: 204, text: async () => '' })
    )
    await expect(saveEntries('e1', 2026, 3, [mockEntry])).resolves.toBeUndefined()
    const [url, init] = vi.mocked(fetch).mock.calls[0] as [string, RequestInit]
    expect(url).toBe('/api/entries')
    expect(init.method).toBe('POST')
    const body = JSON.parse(init.body as string)
    expect(body.employeeId).toBe('e1')
    expect(body.entries).toEqual([mockEntry])
  })

  it('throws on non-2xx response', async () => {
    mockFetch({ error: 'bad request' }, 400)
    await expect(saveEntries('e1', 2026, 3, [])).rejects.toThrow('400')
  })
})

describe('fetchAllEntriesForMonth', () => {
  beforeEach(() => vi.unstubAllGlobals())

  it('calls GET /api/entries with year+month only (no employeeId)', async () => {
    mockFetch({ entries: [mockEntry] })
    const result = await fetchAllEntriesForMonth(2026, 3)
    expect(result).toEqual([mockEntry])
    const url = vi.mocked(fetch).mock.calls[0][0] as string
    expect(url).toContain('/api/entries')
    expect(url).toContain('year=2026')
    expect(url).toContain('month=3')
    expect(url).not.toContain('employeeId')
  })
})
```

- [ ] **Step 2: Run test — expect FAIL (old implementation calls Atlas URL)**

```bash
npx vitest run src/lib/mongoApi.test.ts
```

Expected: FAIL — tests fail because the current implementation calls the dead Atlas URL, not `/api/*`.

- [ ] **Step 3: Rewrite `src/lib/mongoApi.ts`**

Replace the entire file:

```ts
import { z } from 'zod'
import {
  EmployeeSchema,
  AttendanceEntrySchema,
  CompanyClosureSchema,
} from './schemas'
import type { AttendanceEntry, CompanyClosure, Employee } from './schemas'

async function apiFetch<T>(
  url: string,
  options: RequestInit,
  schema: z.ZodType<T>
): Promise<T> {
  const res = await fetch(url, options)
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText)
    throw new Error(`API error ${res.status}: ${text}`)
  }
  const json = await res.json()
  return schema.parse(json)
}

// ── Employees ───────────────────────────────────────────────────────────────

export async function fetchEmployees(): Promise<Employee[]> {
  const result = await apiFetch(
    '/api/employees',
    { method: 'GET' },
    z.object({ employees: z.array(EmployeeSchema) })
  )
  return result.employees
}

// ── Company Closures ─────────────────────────────────────────────────────────

export async function fetchClosures(): Promise<CompanyClosure[]> {
  const result = await apiFetch(
    '/api/closures',
    { method: 'GET' },
    z.object({ closures: z.array(CompanyClosureSchema) })
  )
  return result.closures
}

// ── Attendance Entries ────────────────────────────────────────────────────────

export async function fetchEntries(
  employeeId: string,
  year: number,
  month: number
): Promise<AttendanceEntry[]> {
  const params = new URLSearchParams({
    employeeId,
    year: String(year),
    month: String(month),
  })
  const result = await apiFetch(
    `/api/entries?${params}`,
    { method: 'GET' },
    z.object({ entries: z.array(AttendanceEntrySchema) })
  )
  return result.entries
}

export async function saveEntries(
  employeeId: string,
  year: number,
  month: number,
  entries: AttendanceEntry[]
): Promise<void> {
  const res = await fetch('/api/entries', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ employeeId, year, month, entries }),
  })
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText)
    throw new Error(`API error ${res.status}: ${text}`)
  }
}

// Fetch all entries for all employees for a given month (used by Summary page)
export async function fetchAllEntriesForMonth(
  year: number,
  month: number
): Promise<AttendanceEntry[]> {
  const params = new URLSearchParams({
    year: String(year),
    month: String(month),
  })
  const result = await apiFetch(
    `/api/entries?${params}`,
    { method: 'GET' },
    z.object({ entries: z.array(AttendanceEntrySchema) })
  )
  return result.entries
}
```

- [ ] **Step 4: Run test — expect PASS**

```bash
npx vitest run src/lib/mongoApi.test.ts
```

Expected: 7 tests pass.

- [ ] **Step 5: Run all tests to confirm nothing regressed**

```bash
npx vitest run
```

Expected: all tests pass.

- [ ] **Step 6: Commit**

```bash
git add src/lib/mongoApi.ts src/lib/mongoApi.test.ts
git commit -m "feat: rewrite mongoApi to call Vercel serverless functions"
```

---

## Task 7: Clean up and final build verification

**Files:**
- Modify: `vite.config.ts`

- [ ] **Step 1: Remove the dead `/api` proxy block from `vite.config.ts`**

Current `vite.config.ts`:
```ts
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': {
        target: 'https://data.mongodb-api.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, '')
      }
    }
  },
  resolve: { ... },
  test: { ... },
})
```

Updated `vite.config.ts` — remove the entire `server` block:
```ts
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

- [ ] **Step 2: Run the full test suite one final time**

```bash
npx vitest run
```

Expected: all tests pass.

- [ ] **Step 3: Run the production build**

```bash
npm run build
```

Expected: `tsc -b` succeeds (type-checks `src/`, `api/`, `vite.config.ts`), then Vite bundles to `dist/`. Exit 0.

- [ ] **Step 4: Commit**

```bash
git add vite.config.ts
git commit -m "chore: remove dead Atlas API proxy from vite config"
```

---

## Task 8: Set environment variables in Vercel and smoke test

- [ ] **Step 1: Add env vars to Vercel project settings**

In the Vercel dashboard → Project → Settings → Environment Variables, add:
- `MONGODB_URI` = your Atlas connection string (`mongodb+srv://...`)
- `MONGODB_DATABASE` = `attendance`

Set for **Production**, **Preview**, and **Development** environments.

- [ ] **Step 2: Add env vars locally for `vercel dev`**

Create `.env.local` (already gitignored by default in Vercel projects — verify it's in `.gitignore`):
```
MONGODB_URI=mongodb+srv://...
MONGODB_DATABASE=attendance
```

- [ ] **Step 3: Start `vercel dev` and smoke test**

```bash
npm run dev   # now runs "vercel dev"
```

Open the app in the browser. Verify:
1. The Home page loads the employee list
2. Navigate to an Attendance page — entries load
3. Edit an entry and save — no errors
4. Navigate to the Summary page — data loads

- [ ] **Step 4: Final commit if any tweaks were needed**

```bash
git add -p   # stage only intentional changes
git commit -m "chore: production smoke test verified"
```
