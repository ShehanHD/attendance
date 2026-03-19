# Vercel Serverless Migration — Design Spec

**Date:** 2026-03-19
**Status:** Approved
**Context:** MongoDB Atlas Data API (`data.mongodb-api.com`) was deprecated and shut down (EOL Sept 2025). This spec describes replacing it with Vercel serverless functions backed by the official MongoDB Node.js driver.

---

## Problem

The app currently calls the MongoDB Atlas Data API directly from the browser via `src/lib/mongoApi.ts`. That endpoint no longer exists. All DB operations are broken.

Additionally, the old approach exposed an API key in the browser (`VITE_ATLAS_API_KEY`), which is a security issue.

---

## Solution

Add three Vercel serverless functions in `api/` that proxy MongoDB operations server-side. The frontend `mongoApi.ts` is rewritten to call these local endpoints (`/api/*`) instead of the dead Atlas API URL. Credentials never leave the server.

---

## File Structure

```
api/
  _db.ts          ← shared MongoDB client (underscore = not a Vercel route)
  employees.ts    ← GET /api/employees
  closures.ts     ← GET /api/closures
  entries.ts      ← GET /api/entries (multiple operations, see below)
src/lib/mongoApi.ts   ← rewritten (same exports, new implementation)
vite.config.ts        ← remove /api proxy block
vercel.json           ← new: Vite build + output config
```

---

## API Contract

### `GET /api/employees`
Returns all employees.
Response `200`: `{ employees: Employee[] }`

### `GET /api/closures`
Returns all company closures.
Response `200`: `{ closures: CompanyClosure[] }`

### `GET /api/entries?employeeId=X&year=Y&month=Z`
Returns attendance entries for one employee × month.
Response `200`: `{ entries: AttendanceEntry[] }`

### `GET /api/entries?year=Y&month=Z` *(no employeeId)*
Returns attendance entries for all employees for a given month (Summary page).
Response `200`: `{ entries: AttendanceEntry[] }`

### `POST /api/entries`
Full replace for one employee × month: deleteMany then insertMany.
Request body: `{ employeeId: string, year: number, month: number, entries: AttendanceEntry[] }`
Response `204`: No Content

---

## Shared MongoDB Client (`api/_db.ts`)

Module-level cached `MongoClient` to reuse connections across warm Vercel invocations:

```ts
let client: MongoClient | null = null

export async function getDb(): Promise<Db> {
  if (!client) {
    client = new MongoClient(process.env.MONGODB_URI!)
    await client.connect()
  }
  return client.db(process.env.MONGODB_DATABASE!)
}
```

Two env vars required (server-side only, no `VITE_` prefix):
- `MONGODB_URI` — Atlas connection string (`mongodb+srv://...`)
- `MONGODB_DATABASE` — database name (currently `attendance`)

---

## Frontend Changes (`src/lib/mongoApi.ts`)

All five exported functions keep their signatures unchanged. Internally, each replaces the `atlasAction()` call with a `fetch('/api/...')` call:

- `fetchEmployees()` → `GET /api/employees`
- `fetchClosures()` → `GET /api/closures`
- `fetchEntries(employeeId, year, month)` → `GET /api/entries?employeeId=X&year=Y&month=Z`
- `saveEntries(employeeId, year, month, entries)` → `POST /api/entries`
- `fetchAllEntriesForMonth(year, month)` → `GET /api/entries?year=Y&month=Z`

Zod validation at the boundary is preserved — shapes of validated responses change to match the new response envelopes (`{ employees }`, `{ closures }`, `{ entries }`).

The `atlasAction()` helper and all `VITE_ATLAS_*` env vars are removed.

---

## Error Handling

**In functions:**
- Missing/invalid query params → `400 { error: "..." }`
- MongoDB errors → `500 { error: "..." }` (no stack traces exposed to client)

**In `mongoApi.ts`:**
- Non-2xx responses → `throw new Error(...)`, same as today
- No changes needed in hooks or components

---

## Vercel Configuration (`vercel.json`)

Minimal config to tell Vercel this is a Vite project:

```json
{
  "buildCommand": "npm run build",
  "outputDirectory": "dist",
  "framework": "vite"
}
```

---

## Dev Environment

- `vercel dev` replaces `vite dev` for local development — runs Vite frontend and API functions together on the same port
- `MONGODB_URI` and `MONGODB_DATABASE` go in `.env.local` (gitignored)
- Remove the now-dead `/api` proxy block from `vite.config.ts`

---

## New Dependencies

- `mongodb` — official MongoDB Node.js driver (production dependency)
- `@vercel/node` — types for Vercel function request/response (dev dependency)

---

## Out of Scope

- Authentication / authorization (no changes)
- Data migration (existing Atlas cluster and data unchanged)
- Any UI or component changes
