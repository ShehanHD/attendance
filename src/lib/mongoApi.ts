import { z } from 'zod'
import {
  EmployeeSchema,
  AuthUserSchema,
  AttendanceEntrySchema,
  CompanyClosureSchema,
  BiometricDeviceSchema,
} from './schemas'
import type { AttendanceEntry, AuthUser, BiometricDevice, CompanyClosure, Employee } from './schemas'

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
  hasTickets: boolean
  email?: string
  password?: string
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

export async function createClosure(data: { date: string; endDate?: string; note: string | null }): Promise<CompanyClosure> {
  const result = await apiFetch(
    '/api/closures',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    },
    z.object({ closure: CompanyClosureSchema })
  )
  return result.closure
}

export async function deleteClosure(id: string): Promise<void> {
  const res = await fetch(`/api/closures?id=${encodeURIComponent(id)}`, { method: 'DELETE' })
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText)
    throw new Error(`API error ${res.status}: ${text}`)
  }
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

export async function initYear(
  employeeId: string,
  year: number,
  months: Array<{ month: number; entries: AttendanceEntry[] }>
): Promise<{ initialized: number[] }> {
  const res = await fetch('/api/init-year', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ employeeId, year, months }),
  })
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText)
    throw new Error(`API error ${res.status}: ${text}`)
  }
  return res.json()
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

// ── Auth ──────────────────────────────────────────────────────────────────────

const AuthUserResponseSchema = z.object({ user: AuthUserSchema })

export async function login(email: string, password: string): Promise<AuthUser> {
  const result = await apiFetch(
    '/api/auth',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    },
    AuthUserResponseSchema
  )
  return result.user
}

export async function logout(): Promise<void> {
  await fetch('/api/auth', { method: 'DELETE' })
}

export async function getMe(): Promise<AuthUser | null> {
  const res = await fetch('/api/auth', { method: 'GET' })
  if (res.status === 401) return null
  if (!res.ok) return null
  const json = await res.json()
  return AuthUserResponseSchema.parse(json).user
}

export async function setEmployeeCredentials(
  employeeId: string,
  email: string,
): Promise<void> {
  const res = await fetch('/api/auth', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ employeeId, email }),
  })
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText)
    throw new Error(`API error ${res.status}: ${text}`)
  }
}

// ── WebAuthn ──────────────────────────────────────────────────────────────────

export async function getWebAuthnRegisterOptions(magicToken?: string): Promise<unknown> {
  const headers: Record<string, string> = {}
  if (magicToken) headers['x-magic-token'] = magicToken
  const res = await fetch('/api/webauthn-register-options', { method: 'GET', headers })
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText)
    throw new Error(`API error ${res.status}: ${text}`)
  }
  return res.json()
}

export async function verifyWebAuthnRegistration(
  response: unknown,
  deviceName?: string,
  magicToken?: string
): Promise<void> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (magicToken) headers['x-magic-token'] = magicToken
  const res = await fetch('/api/webauthn-register-verify', {
    method: 'POST',
    headers,
    body: JSON.stringify({ response, deviceName }),
  })
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText)
    throw new Error(`API error ${res.status}: ${text}`)
  }
}

export async function getWebAuthnLoginOptions(): Promise<{ options: unknown; challengeId: string }> {
  const res = await fetch('/api/webauthn-login-options', { method: 'POST' })
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText)
    throw new Error(`API error ${res.status}: ${text}`)
  }
  return res.json()
}

export async function verifyWebAuthnLogin(challengeId: string, response: unknown): Promise<AuthUser> {
  const result = await apiFetch(
    '/api/webauthn-login-verify',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ challengeId, response }),
    },
    AuthUserResponseSchema
  )
  return result.user
}

export async function fetchWebAuthnCredentials(): Promise<BiometricDevice[]> {
  const result = await apiFetch(
    '/api/webauthn-credentials',
    { method: 'GET' },
    z.object({ devices: z.array(BiometricDeviceSchema) })
  )
  return result.devices
}

export async function deleteWebAuthnCredential(id: string): Promise<void> {
  const res = await fetch(`/api/webauthn-credentials?id=${encodeURIComponent(id)}`, { method: 'DELETE' })
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText)
    throw new Error(`API error ${res.status}: ${text}`)
  }
}

export async function sendDeviceRegistrationLink(): Promise<void> {
  const res = await fetch('/api/webauthn-magic-link', { method: 'POST' })
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText)
    throw new Error(`API error ${res.status}: ${text}`)
  }
}

export async function validateMagicToken(token: string): Promise<{ employeeName: string }> {
  return apiFetch(
    `/api/webauthn-magic-link?token=${encodeURIComponent(token)}`,
    { method: 'GET' },
    z.object({ employeeName: z.string() })
  )
}

export async function completeDeviceRegistration(token: string): Promise<void> {
  const res = await fetch('/api/webauthn-magic-link-complete', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token }),
  })
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText)
    throw new Error(`API error ${res.status}: ${text}`)
  }
}

export async function changePassword(currentPassword: string | undefined, newPassword: string): Promise<void> {
  const res = await fetch('/api/auth', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ currentPassword, newPassword }),
  })
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText)
    throw new Error(`API error ${res.status}: ${text}`)
  }
}

// ── Fetch all entries for all employees for a given month (used by Summary page)
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
