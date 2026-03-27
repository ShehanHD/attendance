import * as XLSX from 'xlsx'
import { computeSummary } from './attendanceUtils'
import type { AttendanceEntry, Employee } from './schemas'

export function exportSummaryToExcel(
  employees: Employee[],
  allEntries: AttendanceEntry[],
  month: number,
  year: number
): void {
  const monthStr = String(month).padStart(2, '0')
  const filename = `summary-${year}-${monthStr}.xlsx`

  const headers = [
    'Employee', 'Hours Worked', 'Absent Hours', 'Vacation Days', 'Sick Days', 'Sick Refs', 'Tickets',
  ]

  const rows = employees.map(emp => {
    const empEntries = allEntries.filter(e => e.employeeId === emp._id)
    if (empEntries.length === 0) return [emp.name, 0, 0, 0, 0, '', 0]
    const s = computeSummary(empEntries)
    const sickRefs = empEntries
      .filter(e => e.type === 'sick' && e.sickRef && e.sickRef.trim() !== '')
      .map(e => e.sickRef as string)
      .join(', ')
    return [emp.name, s.hoursWorked, s.absentHours, s.vacationDays, s.sickDays, sickRefs, s.tickets]
  })

  const ws = XLSX.utils.aoa_to_sheet([headers, ...rows])
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Summary')
  XLSX.writeFile(wb, filename)
}
