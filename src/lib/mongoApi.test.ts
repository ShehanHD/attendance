import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  fetchEmployees,
  fetchClosures,
  fetchEntries,
  saveEntries,
  fetchAllEntriesForMonth,
} from './mongoApi'
import type { Employee, CompanyClosure, AttendanceEntry } from './schemas'

const mockEmployee: Employee = { _id: 'e1', name: 'Alice', standardHours: 8, isAdmin: false, isActive: true }
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
