import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('xlsx', () => {
  const mockAoaToSheet = vi.fn().mockReturnValue({ '!ref': 'A1:G3' })
  const mockBookNew = vi.fn().mockReturnValue({})
  const mockBookAppendSheet = vi.fn()
  const mockWriteFile = vi.fn()

  return {
    utils: {
      aoa_to_sheet: mockAoaToSheet,
      book_new: mockBookNew,
      book_append_sheet: mockBookAppendSheet,
    },
    writeFile: mockWriteFile,
  }
})

import { exportSummaryToExcel } from './exportUtils'
import type { Employee, AttendanceEntry } from './schemas'
import * as XLSX from 'xlsx'

const employees: Employee[] = [
  {
    _id: 'emp1', name: 'Alice', standardHours: 8, isAdmin: false, isActive: true, hasTickets: true,
    createdAt: ""
  },
  {
    _id: 'emp2', name: 'Bob', standardHours: 8, isAdmin: true, isActive: true, hasTickets: true,
    createdAt: ""
  },
]

const entries: AttendanceEntry[] = [
  { _id: 'e1', employeeId: 'emp1', date: '2026-03-01', type: 'present',  hours: 8, sickRef: null },
  { _id: 'e2', employeeId: 'emp1', date: '2026-03-02', type: 'vacation', hours: 0, sickRef: null },
  { _id: 'e3', employeeId: 'emp1', date: '2026-03-03', type: 'sick',     hours: 0, sickRef: 'REF-001' },
  { _id: 'e4', employeeId: 'emp2', date: '2026-03-01', type: 'present',  hours: 8, sickRef: null },
  { _id: 'e5', employeeId: 'emp2', date: '2026-03-02', type: 'absent',   hours: 4, sickRef: null },
]

describe('exportSummaryToExcel', () => {
  beforeEach(() => vi.clearAllMocks())

  it('passes correct headers and row data to aoa_to_sheet', () => {
    exportSummaryToExcel(employees, entries, 3, 2026)

    const mockAoaToSheet = vi.mocked(XLSX.utils.aoa_to_sheet)
    expect(mockAoaToSheet).toHaveBeenCalledOnce()
    const [data] = mockAoaToSheet.mock.calls[0]

    expect(data[0]).toEqual([
      'Employee', 'Hours Worked', 'Absent Hours', 'Vacation Days', 'Sick Days', 'Sick Refs', 'Tickets',
    ])
    // Alice: 8h worked, 0 absent, 1 vacation, 1 sick (REF-001), 1 ticket
    expect(data[1]).toEqual(['Alice', 8, 0, 1, 1, 'REF-001', 1])
    // Bob: 12h worked (8 present + 4 absent), 4h absent, 0 vacation, 0 sick, 1 ticket
    expect(data[2]).toEqual(['Bob', 12, 4, 0, 0, '', 1])
  })

  it('generates filename with zero-padded month', () => {
    exportSummaryToExcel(employees, entries, 3, 2026)
    const mockWriteFile = vi.mocked(XLSX.writeFile)
    expect(mockWriteFile).toHaveBeenCalledWith(expect.anything(), 'summary-2026-03.xlsx')
  })

  it('appends sheet named "Summary" to workbook', () => {
    exportSummaryToExcel(employees, entries, 3, 2026)
    const mockBookAppendSheet = vi.mocked(XLSX.utils.book_append_sheet)
    expect(mockBookAppendSheet).toHaveBeenCalledWith(expect.anything(), expect.anything(), 'Summary')
  })

  it('outputs empty string for sick refs when employee has no sick entries', () => {
    const bobOnly = entries.filter(e => e.employeeId === 'emp2')
    exportSummaryToExcel([employees[1]], bobOnly, 3, 2026)
    const mockAoaToSheet = vi.mocked(XLSX.utils.aoa_to_sheet)
    const [data] = mockAoaToSheet.mock.calls[0]
    expect(data[1][5]).toBe('')
  })

  it('outputs all zeros for employee with no entries', () => {
    exportSummaryToExcel(employees, [], 3, 2026)
    const mockAoaToSheet = vi.mocked(XLSX.utils.aoa_to_sheet)
    const [data] = mockAoaToSheet.mock.calls[0]
    expect(data[1]).toEqual(['Alice', 0, 0, 0, 0, '', 0])
    expect(data[2]).toEqual(['Bob',   0, 0, 0, 0, '', 0])
  })
})
