import { useState, useEffect, useRef, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { toast } from 'sonner'
import CellEditor from './CellEditor'
import {
  buildDefaultEntries,
  computeSummary,
  isDisabledDay,
  getHolidayLabel,
} from '@/lib/attendanceUtils'

const CELL_LABELS: Record<string, string> = {
  present: 'PRE',
  absent: 'ABS',
  vacation: 'VAC',
  sick: 'SIC',
}

const CELL_TEXT_COLORS: Record<string, string> = {
  present: 'text-green-600',
  absent: 'text-orange-500',
  vacation: 'text-blue-500',
  sick: 'text-red-500',
}
import { useAttendanceEntries, useSaveAttendance } from '@/hooks/useAttendance'
import { initYear } from '@/lib/mongoApi'
import { useAuth } from '@/contexts/AuthContext'
import type { AttendanceEntry, CompanyClosure, Employee } from '@/lib/schemas'

interface Props {
  employee: Employee
  closures: CompanyClosure[]
  onDirtyChange: (dirty: boolean) => void
}

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

const DOT_COLORS: Record<string, string> = {
  present: 'bg-green-500',
  absent: 'bg-orange-400',
  vacation: 'bg-blue-500',
  sick: 'bg-red-500',
}

const DOT_LABELS: Record<string, string> = {
  present: 'Present',
  absent: 'Absent',
  vacation: 'Vacation',
  sick: 'Sick',
}

const DAY_HEADERS = [
  { full: 'Mon', short: 'M' },
  { full: 'Tue', short: 'T' },
  { full: 'Wed', short: 'W' },
  { full: 'Thu', short: 'T' },
  { full: 'Fri', short: 'F' },
  { full: 'Sat', short: 'S' },
  { full: 'Sun', short: 'S' },
]

export default function AttendanceGrid({ employee, closures, onDirtyChange }: Props) {
  const { user } = useAuth()
  const now = new Date()
  const currentYear = now.getFullYear()
  const currentMonth = now.getMonth() + 1
  const YEARS = [currentYear - 1, currentYear, currentYear + 1]

  const [month, setMonth] = useState(now.getMonth() + 1)
  const [year, setYear] = useState(currentYear)
  const [entries, setEntries] = useState<AttendanceEntry[]>([])
  const [isDirty, setIsDirty] = useState(false)
  const [isSaving, setIsSaving] = useState(false)

  const [pendingNav, setPendingNav] = useState<{ month: number; year: number } | null>(null)

  const saveAttendance = useSaveAttendance()

  // Non-admins cannot edit past months — only the current month and future
  const isPastMonth = year < currentYear || (year === currentYear && month < currentMonth)
  const isReadOnly = !user?.isAdmin && isPastMonth

  const { data: fetched, isLoading, isError, refetch } = useAttendanceEntries(
    employee._id,
    year,
    month
  )

  const isDirtyRef = useRef(false)
  useEffect(() => {
    isDirtyRef.current = isDirty
  }, [isDirty])

  useEffect(() => {
    if (fetched === undefined) return
    if (isDirtyRef.current) return
    if (fetched.length > 0) {
      setEntries(fetched)
    } else {
      // Show current month defaults immediately (no loading flash)
      const defaults = buildDefaultEntries(employee, month, year, closures)
      setEntries(defaults)

      // Initialize all 12 months for this employee-year in one request.
      // Months that already have entries are skipped server-side (idempotent).
      const allMonths = Array.from({ length: 12 }, (_, i) => ({
        month: i + 1,
        entries: buildDefaultEntries(employee, i + 1, year, closures),
      }))
      initYear(employee._id, year, allMonths)
        .then(({ initialized }) => {
          // Refetch current month to get server-assigned _ids
          if (initialized.includes(month)) refetch()
        })
        .catch(() => {
          // Fall back: save only the current month the old way
          saveAttendance(employee._id, year, month, defaults)
            .then(fresh => setEntries(fresh))
            .catch(() => {})
        })
    }
  }, [fetched, employee, month, year, closures]) // eslint-disable-line react-hooks/exhaustive-deps

  const markDirty = useCallback(() => {
    if (!isDirty) {
      setIsDirty(true)
      onDirtyChange(true)
    }
  }, [isDirty, onDirtyChange])

  const handleCellSave = (updated: AttendanceEntry) => {
    setEntries(prev => prev.map(e => e._id === updated._id ? updated : e))
    markDirty()
  }

  const navigateTo = (newMonth: number, newYear: number) => {
    if (isDirty) {
      setPendingNav({ month: newMonth, year: newYear })
    } else {
      setMonth(newMonth)
      setYear(newYear)
    }
  }

  const confirmDiscard = () => {
    if (!pendingNav) return
    setIsDirty(false)
    onDirtyChange(false)
    setMonth(pendingNav.month)
    setYear(pendingNav.year)
    setPendingNav(null)
  }

  const cancelDiscard = () => setPendingNav(null)

  const handleSave = async () => {
    const missingSickRef = entries.some(
      e => e.type === 'sick' && (!e.sickRef || e.sickRef.trim() === '')
    )
    if (missingSickRef) {
      toast.warning('Sick reference required', {
        description: 'All sick entries must have a reference number.',
      })
      return
    }

    if (entries.some(e => e.employeeId !== employee._id)) {
      toast.error('Data error', { description: 'Entry mismatch detected.' })
      return
    }

    setIsSaving(true)
    try {
      const fresh = await saveAttendance(employee._id, year, month, entries)
      setEntries(fresh)
      setIsDirty(false)
      onDirtyChange(false)
      toast.success('Saved', { description: 'Attendance saved successfully.' })
    } catch (err) {
      toast.error('Save failed', {
        description: err instanceof Error ? err.message : 'Unknown error',
      })
    } finally {
      setIsSaving(false)
    }
  }

  const daysInMonth = new Date(year, month, 0).getDate()

  const weeks: (number | null)[][] = (() => {
    const firstDow = new Date(year, month - 1, 1).getDay()
    const offset = (firstDow + 6) % 7
    const result: (number | null)[][] = []
    let week: (number | null)[] = Array(offset).fill(null)
    for (let day = 1; day <= daysInMonth; day++) {
      week.push(day)
      if (week.length === 7) { result.push(week); week = [] }
    }
    if (week.length > 0) {
      while (week.length < 7) week.push(null)
      result.push(week)
    }
    return result
  })()

  const summary = computeSummary(entries)

  if (isLoading) {
    return <p className='text-muted-foreground p-4'>Loading…</p>
  }

  if (isError) {
    return (
      <Alert variant='destructive' className='m-4'>
        <AlertDescription>
          Failed to load attendance.{' '}
          <button onClick={() => refetch()} className='underline'>Retry</button>
        </AlertDescription>
      </Alert>
    )
  }

  return (
    <div className='space-y-4'>
      {/* Month / Year selectors */}
      <div className='flex gap-2 items-center flex-wrap'>
        <Select
          value={String(month)}
          onValueChange={v => navigateTo(Number(v), year)}
        >
          <SelectTrigger className='w-36'>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {MONTHS.map((name, i) => (
              <SelectItem key={i + 1} value={String(i + 1)}>{name}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={String(year)}
          onValueChange={v => navigateTo(month, Number(v))}
        >
          <SelectTrigger className='w-24'>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {YEARS.map(y => (
              <SelectItem key={y} value={String(y)}>{y}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        {isDirty && <Badge variant='outline' className='text-orange-600 border-orange-400'>Unsaved changes</Badge>}
        {isReadOnly && <Badge variant='outline' className='text-muted-foreground'>Read-only</Badge>}
      </div>

      {/* Grid — weeks as rows, Mon–Sun as columns */}
      <div className='rounded-md border overflow-hidden'>
        <div className='grid grid-cols-7'>
          {/* Day-of-week header */}
          {DAY_HEADERS.map(d => (
            <div key={d.full} className='bg-muted py-2 text-center font-medium text-muted-foreground'>
              <span className='hidden sm:inline text-xs'>{d.full}</span>
              <span className='sm:hidden text-xs'>{d.short}</span>
            </div>
          ))}

          {/* Week rows */}
          {weeks.flatMap((week, wi) =>
            week.map((day, di) => {
              if (day === null) {
                return <div key={`${wi}-${di}`} className='bg-muted/20 min-h-[2.75rem]' />
              }

              const disabled = isDisabledDay(year, month, day)
              const iso = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
              const entry = entries.find(e => e.date === iso)

              if (disabled) {
                const label = getHolidayLabel(year, month, day, closures)
                return (
                  <div key={`${wi}-${di}`} className='flex flex-col items-center pt-1.5 bg-muted/40 min-h-[2.75rem]'>
                    <div className='text-[10px] text-muted-foreground/60 font-medium leading-none'>{day}</div>
                    {label && (
                      <div className='mt-1.5 w-2 h-2 rounded-full bg-muted-foreground/25' title={label} />
                    )}
                  </div>
                )
              }

              const cellContent = entry ? (
                <span
                  className='mt-0.5 flex items-center justify-center w-full h-8 px-0.5'
                  title={`${DOT_LABELS[entry.type]}${entry.type !== 'present' && entry.hours > 0 ? ` · ${entry.hours}h` : ''}`}
                >
                  <span className={`sm:hidden w-3 h-3 rounded-full flex-shrink-0 ${DOT_COLORS[entry.type]}`} />
                  <span className={`hidden sm:flex flex-col items-center leading-none ${CELL_TEXT_COLORS[entry.type]}`}>
                    <span className='text-[9px] font-bold tracking-wide'>{CELL_LABELS[entry.type]}</span>
                    {entry.type !== 'present' && entry.hours > 0 && <span className='text-[8px] text-muted-foreground mt-0.5'>{entry.hours}h</span>}
                  </span>
                </span>
              ) : (
                <div className='mt-0.5 w-8 h-8 flex items-center justify-center'>
                  <span className='w-1.5 h-1.5 rounded-full bg-muted-foreground/20' />
                </div>
              )

              return (
                <div key={`${wi}-${di}`} className='flex flex-col items-center pt-1.5 min-h-[2.75rem]'>
                  <div className='text-[10px] text-muted-foreground font-medium leading-none'>{day}</div>
                  {isReadOnly || !entry ? cellContent : (
                    <CellEditor entry={entry} onSave={handleCellSave}>
                      <button className='mt-0.5 flex items-center justify-center w-full h-8 rounded hover:bg-muted/50 active:bg-muted/70 data-[state=open]:bg-accent data-[state=open]:ring-2 data-[state=open]:ring-ring transition-colors px-0.5'>
                        {/* Mobile: colored dot */}
                        <span className={`sm:hidden w-3 h-3 rounded-full flex-shrink-0 ${DOT_COLORS[entry.type]}`} />
                        {/* Desktop: text label */}
                        <span className={`hidden sm:flex flex-col items-center leading-none ${CELL_TEXT_COLORS[entry.type]}`}>
                          <span className='text-[9px] font-bold tracking-wide'>{CELL_LABELS[entry.type]}</span>
                          {entry.type !== 'present' && entry.hours > 0 && <span className='text-[8px] text-muted-foreground mt-0.5'>{entry.hours}h</span>}
                        </span>
                      </button>
                    </CellEditor>
                  )}
                </div>
              )
            })
          )}
        </div>
      </div>

      {/* Legend */}
      <div className='flex gap-3 flex-wrap'>
        {Object.entries(DOT_COLORS).map(([type, color]) => (
          <span key={type} className='flex items-center gap-1.5 text-xs text-muted-foreground'>
            <span className={`w-2.5 h-2.5 rounded-full ${color} inline-block flex-shrink-0`} />
            {DOT_LABELS[type]}
          </span>
        ))}
      </div>

      {/* Summary */}
      <div className='flex gap-4 text-sm flex-wrap'>
        <span><strong>{summary.hoursWorked}h</strong> worked</span>
        <span><strong>{summary.vacationDays}</strong> vacation</span>
        <span><strong>{summary.sickDays}</strong> sick</span>
        <span><strong>{summary.tickets}</strong> tickets</span>
      </div>

      {/* Save */}
      {!isReadOnly && (
        <Button className='w-full sm:w-auto' onClick={handleSave} disabled={isSaving || !isDirty}>
          {isSaving ? 'Saving…' : 'Save'}
        </Button>
      )}

      {/* Dirty navigation guard */}
      <AlertDialog open={pendingNav !== null}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Unsaved changes</AlertDialogTitle>
            <AlertDialogDescription>
              You have unsaved changes. Leave without saving?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={cancelDiscard}>Stay</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDiscard}>Leave</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
