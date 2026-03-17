import type { AttendanceEntry, CompanyClosure, Employee } from './schemas'

// Fixed Italian national holidays (month 1-indexed).
// Easter Sunday is always a Sunday (disabled as weekend).
// Easter Monday is computed dynamically via getEasterDate().
const ITALIAN_PUBLIC_HOLIDAYS: { month: number; day: number }[] = [
  { month: 1, day: 1 },   // Capodanno
  { month: 1, day: 6 },   // Epifania
  { month: 4, day: 25 },  // Festa della Liberazione
  { month: 5, day: 1 },   // Festa dei Lavoratori
  { month: 6, day: 2 },   // Festa della Repubblica
  { month: 8, day: 15 },  // Ferragosto
  { month: 11, day: 1 },  // Ognissanti
  { month: 12, day: 8 },  // Immacolata Concezione
  { month: 12, day: 25 }, // Natale
  { month: 12, day: 26 }, // Santo Stefano
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
  if (closures.some(c => c.date === iso)) return true

  return false
}

// Generates present-default entries for non-disabled working days.
// Past/current month: caps at today.
// Future months: returns [] (caller shows "No entries yet" message).
// Each entry uses: type="present", hours=employee.standardHours,
// sickRef=null, _id=crypto.randomUUID() (temporary, replaced after save).
export function buildDefaultEntries(
  employee: Employee,
  month: number,
  year: number,
  closures: CompanyClosure[]
): AttendanceEntry[] {
  const now = new Date()
  const currentYear = now.getFullYear()
  const currentMonth = now.getMonth() + 1

  const isFuture =
    year > currentYear || (year === currentYear && month > currentMonth)

  if (isFuture) return []

  const daysInMonth = new Date(year, month, 0).getDate()
  const isCurrentMonth = year === currentYear && month === currentMonth
  const capDay = isCurrentMonth ? now.getDate() : daysInMonth

  const entries: AttendanceEntry[] = []

  for (let day = 1; day <= capDay; day++) {
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
