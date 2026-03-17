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
