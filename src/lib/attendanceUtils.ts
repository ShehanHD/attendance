import type {AttendanceEntry, CompanyClosure} from './schemas'

// Fixed Italian national holidays + Milan patron saint (month 1-indexed, all years).
// Easter Sunday is always a Sunday (disabled as weekend).
// Easter Monday is computed dynamically via getEasterDate().
const ITALIAN_PUBLIC_HOLIDAYS: { month: number; day: number; name: string }[] = [
  { month: 1,  day: 1,  name: 'Capodanno' },
  { month: 1,  day: 6,  name: 'Epifania' },
  { month: 4,  day: 25, name: 'Festa della Liberazione' },
  { month: 5,  day: 1,  name: 'Festa dei Lavoratori' },
  { month: 6,  day: 2,  name: 'Festa della Repubblica' },
  { month: 8,  day: 15, name: 'Ferragosto' },
  { month: 11, day: 1,  name: 'Ognissanti' },
  { month: 12, day: 7,  name: "Sant'Ambrogio" },   // Milan
  { month: 12, day: 8,  name: 'Immacolata Concezione' },
  { month: 12, day: 25, name: 'Natale' },
  { month: 12, day: 26, name: 'Santo Stefano' },
]

// Easter Sunday for the given year using the Anonymous Gregorian algorithm.
// Used to derive Easter Monday: one day after this date.
export function getEasterDate(year: number): Date {
  const a = year % 19
  const b = Math.floor(year / 100)
  const c = year % 100
  const d = Math.floor(b / 4)
  const e = b % 4
  const f = Math.floor((b + 8) / 25)
  const g = Math.floor((b - f + 1) / 3)
  const h = (19 * a + b - d - g + 15) % 30
  const i = Math.floor(c / 4)
  const k = c % 4
  const l = (32 + 2 * e + 2 * i - h - k) % 7
  const m = Math.floor((a + 11 * h + 22 * l) / 451)
  const month = Math.floor((h + l - 7 * m + 114) / 31) // 1-indexed
  const day = ((h + l - 7 * m + 114) % 31) + 1
  return new Date(year, month - 1, day)
}

// Returns true if the day is a weekend, Italian public holiday
// (including Easter Monday), or a company closure.
export function isDisabledDay(
  year: number,
  month: number,
  day: number,
  closures: CompanyClosure[]
): boolean {
  const date = new Date(year, month - 1, day)
  const dow = date.getDay() // 0 = Sunday, 6 = Saturday

  if (dow === 0 || dow === 6) return true

  if (ITALIAN_PUBLIC_HOLIDAYS.some(h => h.month === month && h.day === day)) return true


  // Easter Monday
  const easter = getEasterDate(year)
  const easterMonday = new Date(easter.getFullYear(), easter.getMonth(), easter.getDate() + 1)
  if (
    easterMonday.getFullYear() === year &&
    easterMonday.getMonth() + 1 === month &&
    easterMonday.getDate() === day
  ) return true

  const iso = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
  if (closures.some(c => iso >= c.date && iso <= (c.endDate ?? c.date))) return true

  return false
}

// Returns the display name for a disabled day (holiday/closure), or null for weekends.
export function getHolidayLabel(
  year: number,
  month: number,
  day: number,
  closures: CompanyClosure[]
): string | null {
  const iso = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`

  // Custom company closure takes priority (has user-defined note)
  const closure = closures.find(c => iso >= c.date && iso <= (c.endDate ?? c.date))
  if (closure?.note) return closure.note

  // Hardcoded national + Milan holidays
  const holiday = ITALIAN_PUBLIC_HOLIDAYS.find(h => h.month === month && h.day === day)
  if (holiday) return holiday.name

  // Easter Monday
  const easter = getEasterDate(year)
  const easterMonday = new Date(easter.getFullYear(), easter.getMonth(), easter.getDate() + 1)
  if (
    easterMonday.getFullYear() === year &&
    easterMonday.getMonth() + 1 === month &&
    easterMonday.getDate() === day
  ) return 'Pasquetta'

  return null
}

// Generates present-default entries for all non-disabled working days in the month.
// Covers past, current, and future months — the whole year is pre-filled as present.
// Each entry uses: type="present", hours=employee.standardHours,
// sickRef=null, _id=crypto.randomUUID() (temporary, replaced after save).
export function buildDefaultEntries(
    employee: { _id: string; name: string; standardHours: number; isAdmin: boolean; isActive: boolean },
    month: number,
    year: number,
    closures: CompanyClosure[]
): AttendanceEntry[] {
  const daysInMonth = new Date(year, month, 0).getDate()

  const entries: AttendanceEntry[] = []

  for (let day = 1; day <= daysInMonth; day++) {
    if (isDisabledDay(year, month, day, closures)) continue
    const iso = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
    entries.push({
      _id: crypto.randomUUID(),
      employeeId: employee._id,
      date: iso,
      type: 'present',
      hours: employee.standardHours,
      sickRef: null,
    })
  }

  return entries
}

// Computes monthly totals from a set of entries.
export function computeSummary(entries: AttendanceEntry[]): {
  hoursWorked: number
  vacationDays: number
  sickDays: number
  tickets: number
} {
  let hoursWorked = 0
  let vacationDays = 0
  let sickDays = 0
  let tickets = 0

  for (const entry of entries) {
    if (entry.type === 'present' || entry.type === 'absent') {
      hoursWorked += entry.hours
    }
    if (entry.type === 'vacation') vacationDays++
    if (entry.type === 'sick') sickDays++
    if (entry.type === 'present') tickets++
  }

  return { hoursWorked, vacationDays, sickDays, tickets }
}
