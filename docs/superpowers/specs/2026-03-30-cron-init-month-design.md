# Design: Automated Month Initialization Cron Job

**Date:** 2026-03-30
**Status:** Approved
**Topic:** Auto-fill current month with default attendance entries for all active employees at month start

---

## Overview

At the start of each new month, a Vercel Cron job automatically initializes attendance entries for all active employees. Days with existing entries are never overwritten. Working days default to `present` at the employee's `standardHours`; company closure days default to `vacation`; weekends and Italian public holidays (including Easter Monday) are skipped entirely.

---

## Architecture

### New Files

- `api/cron-init-month.ts` — Vercel serverless function, invoked by the cron schedule
- `vercel.json` — Cron schedule config (create or update)

### No Changes To

- `api/init-year.ts` — unchanged; still used by the frontend `AttendanceGrid` per-employee flow
- `src/lib/attendanceUtils.ts` — unchanged; entry-generation logic is duplicated server-side (avoids cross-layer `src/` → `api/` imports)

---

## API Endpoint: `POST /api/cron-init-month`

### Authentication

Vercel Cron sends `Authorization: Bearer <CRON_SECRET>` automatically.
The endpoint verifies this header and returns `401` if missing or wrong.
Env var `CRON_SECRET` must be set in the Vercel dashboard.

### Logic (in order)

1. Compute `year` and `month` from `new Date()` (UTC)
2. Fetch all employees where `isActive !== false` from the `employees` collection
3. Fetch all company closures from the `closures` collection
4. For each active employee:
   - Count existing entries for this `year-MM` prefix in `attendance_entries`
   - If count `> 0`: skip (idempotent guard)
   - Otherwise: generate and bulk-insert default entries
5. Return `{ initialized: number, skipped: number }`

### Entry Generation Rules (server-side mirror of `buildDefaultEntries`)

| Day type | Entry type | Hours |
|---|---|---|
| Weekend (Sat/Sun) | — skipped — | — |
| Italian public holiday | — skipped — | — |
| Easter Monday (dynamic) | — skipped — | — |
| Company closure | `vacation` | `0` |
| Normal working day | `present` | `employee.standardHours` |

`_id` is assigned via `new ObjectId()` (server-side; no `crypto.randomUUID()` needed).

### Response

```json
{ "initialized": 12, "skipped": 3 }
```

---

## Vercel Cron Config (`vercel.json`)

```json
{
  "crons": [{
    "path": "/api/cron-init-month",
    "schedule": "0 0 1 * *"
  }]
}
```

Runs at **00:00 UTC on the 1st of every month**.

Manual trigger (for testing):
```bash
curl -X POST https://<your-app>.vercel.app/api/cron-init-month \
  -H "Authorization: Bearer <CRON_SECRET>"
```

---

## Edge Cases

| Scenario | Behavior |
|---|---|
| Employee added mid-month | Gets initialized (no entries → fills month) |
| Employee deactivated | Excluded by `isActive !== false` filter |
| Cron runs twice (Vercel retry) | Idempotent — existing entries guard prevents duplicates |
| Partial failure on one employee | Loop continues; counts reflect actual outcome |
| `CRON_SECRET` not set | Returns `401` — no open access |

---

## Environment Variables

| Variable | Description |
|---|---|
| `CRON_SECRET` | Secret token for cron endpoint auth. Set in Vercel dashboard. |

---

## Out of Scope

- Backfilling previous months (only current month is initialized)
- Notifying employees when their month is initialized
- Changing the existing per-employee `init-year` flow in `AttendanceGrid`
