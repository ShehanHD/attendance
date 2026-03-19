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
vercel.json           ← new: Vite build + output config + SPA rewrite
.env.example          ← updated: replace VITE_ATLAS_* with MONGODB_URI/MONGODB_DATABASE placeholder strings (no real values)
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

**Atomicity note:** The delete+insert is not atomic (no transaction). If the function is killed between the two operations, the month's data is lost. This risk is accepted because the operation is user-initiated and immediately re-saveable — the user can simply save again to restore. The app has no background writes that could cause silent data loss.

**`_id` stripping:** The request body includes `entries: AttendanceEntry[]` where each entry has an `_id: string` field. The serverless handler must strip `_id` from each entry before calling `insertMany` (i.e., `entries.map(({ _id: _, ...rest }) => rest)`). Passing string `_id` values directly to MongoDB would cause BSON type mismatches on existing ObjectId documents and corrupt `_id` types for new insertions. This mirrors the existing client-side logic in the current `mongoApi.ts`.

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

**`_id` serialization:** The MongoDB Node.js driver returns `_id` as a BSON `ObjectId` instance, not a string. Each serverless function must convert `_id` to a string (`.toString()`) before serializing the response to JSON. Without this, the existing `_id: z.string()` Zod schemas will fail at the frontend validation boundary on every response.

The `atlasAction()` helper and all `VITE_ATLAS_*` env vars are removed.

---

## Error Handling

**In functions:**
- Missing/invalid query params → `400 { error: "..." }`
- MongoDB errors → `500 { error: "..." }` (no stack traces exposed to client)
- The `POST /api/entries` handler does **not** need to Zod-validate the `insertMany` driver result. The MongoDB driver throws on any error before returning, so a successful call guarantees the insert happened. The frontend receives only `204 No Content` and does not parse a response body.

**In `mongoApi.ts`:**
- Non-2xx responses → `throw new Error(...)`, same as today
- No changes needed in hooks or components

---

## Vercel Configuration (`vercel.json`)

Minimal config: `framework: "vite"` is sufficient for Vercel to infer build command and output directory. The only addition needed is the SPA fallback rewrite so direct navigation to non-root routes (e.g., `/attendance/2026/3`) serves `index.html` instead of 404ing:

```json
{
  "framework": "vite",
  "rewrites": [{ "source": "/((?!api/).*)", "destination": "/index.html" }]
}
```

The negative lookahead in the rewrite source excludes `/api/*` paths so serverless function requests are not intercepted.

---

## Dev Environment

- `vercel dev` replaces `vite dev` for local development — runs Vite frontend and API functions together on the same port
- Update `package.json` `"dev"` script from `"vite"` to `"vercel dev"` so `npm run dev` works correctly
- `MONGODB_URI` and `MONGODB_DATABASE` go in `.env.local` (gitignored)
- Remove the now-dead `/api` proxy block from `vite.config.ts`

---

## TypeScript Configuration

The `api/` directory is not covered by any existing `tsconfig`. `tsconfig.node.json` cannot be used directly because it sets `"moduleResolution": "bundler"` and `"allowImportingTsExtensions": true` — both bundler-specific settings incompatible with the Node.js resolution the MongoDB driver and `@vercel/node` types require.

Create a new `tsconfig.api.json` alongside the existing configs:

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
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true
  },
  "include": ["api"]
}
```

Then add a reference to it in the root `tsconfig.json`:
```json
{ "path": "./tsconfig.api.json" }
```

This ensures `tsc -b` type-checks `api/` locally as part of `npm run build`, without affecting the existing Vite or node configs. Vercel handles the actual compilation of `api/` at deploy time independently.

---

## New Dependencies

- `mongodb` — official MongoDB Node.js driver (production dependency)
- `@vercel/node` — types for Vercel function request/response (dev dependency)

---

## Out of Scope

- Authentication / authorization (no changes)
- Data migration (existing Atlas cluster and data unchanged)
- Any UI or component changes
