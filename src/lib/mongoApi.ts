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
