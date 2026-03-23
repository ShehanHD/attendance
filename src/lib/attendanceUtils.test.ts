import {describe, expect, it} from 'vitest'
import {buildDefaultEntries, computeSummary, getEasterDate, isDisabledDay,} from './attendanceUtils'
import type {CompanyClosure} from './schemas'

const noClosures: CompanyClosure[] = []

const employee: { _id: string; name: string; standardHours: number; isAdmin: boolean; isActive: boolean } = {
  _id: 'emp1',
  name: 'Mario Rossi',
  standardHours: 8,
  isAdmin: false,
  isActive: true,
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
    // March 2020: 31 days, minus weekends and holidays
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
