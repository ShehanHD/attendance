import { useState, useEffect, useCallback } from 'react'
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
} from '@/lib/attendanceUtils'
import { useAttendanceEntries, useSaveAttendance } from '@/hooks/useAttendance'
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

const TYPE_COLORS: Record<string, string> = {
  present: 'bg-green-100 text-green-800',
  absent: 'bg-orange-100 text-orange-800',
  vacation: 'bg-blue-100 text-blue-800',
  sick: 'bg-red-100 text-red-800',
}

export default function AttendanceGrid({ employee, closures, onDirtyChange }: Props) {
  const now = new Date()
  const currentYear = now.getFullYear()
  const YEARS = [currentYear - 1, currentYear, currentYear + 1]

  const [month, setMonth] = useState(now.getMonth() + 1)
  const [year, setYear] = useState(currentYear)
  const [entries, setEntries] = useState<AttendanceEntry[]>([])
  const [isDirty, setIsDirty] = useState(false)
  const [isSaving, setIsSaving] = useState(false)

  // Pending navigation: { month, year } or null
  const [pendingNav, setPendingNav] = useState<{ month: number; year: number } | null>(null)

  const saveAttendance = useSaveAttendance()

  const { data: fetched, isLoading, isError, refetch } = useAttendanceEntries(
    employee._id,
    year,
    month
  )

  // When fetched data arrives, populate entries (with defaults if empty)
  useEffect(() => {
    if (fetched === undefined) return
    if (fetched.length > 0) {
      setEntries(fetched)
    } else {
      setEntries(buildDefaultEntries(employee, month, year, closures))
    }
    setIsDirty(false)
    onDirtyChange(false)
  }, [fetched]) // eslint-disable-line react-hooks/exhaustive-deps

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
    // Pre-save validation
    const missingSickRef = entries.some(
      e => e.type === 'sick' && (!e.sickRef || e.sickRef.trim() === '')
    )
    if (missingSickRef) {
      toast.warning('Sick reference required', {
        description: 'All sick entries must have a reference number.',
      })
      return
    }

    // Safety assertion
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
      <div className='flex gap-3 items-center flex-wrap'>
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
      </div>

      {/* Grid */}
      <div className='overflow-x-auto rounded-md border'>
        <table className='min-w-full text-sm'>
          <thead className='bg-muted'>
            <tr>
              {Array.from({ length: daysInMonth }, (_, i) => i + 1).map(day => {
                const disabled = isDisabledDay(year, month, day, closures)
                return (
                  <th
                    key={day}
                    className={`px-2 py-1 text-center font-medium ${disabled ? 'text-muted-foreground' : ''}`}
                  >
                    {day}
                  </th>
                )
              })}
            </tr>
          </thead>
          <tbody>
            <tr>
              {Array.from({ length: daysInMonth }, (_, i) => i + 1).map(day => {
                const disabled = isDisabledDay(year, month, day, closures)
                const iso = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
                const entry = entries.find(e => e.date === iso)

                if (disabled) {
                  return (
                    <td key={day} className='px-2 py-2 text-center bg-muted/40 text-muted-foreground'>
                      —
                    </td>
                  )
                }

                if (!entry) {
                  // Future month with no entries
                  return <td key={day} className='px-2 py-2 text-center text-muted-foreground'>·</td>
                }

                return (
                  <td key={day} className='px-1 py-1 text-center'>
                    <CellEditor entry={entry} onSave={handleCellSave}>
                      <button
                        className={`w-full rounded px-1 py-0.5 text-xs font-medium ${TYPE_COLORS[entry.type]} hover:opacity-80`}
                      >
                        {entry.type.slice(0, 3).toUpperCase()}
                        {entry.hours > 0 && <span className='ml-0.5 opacity-70'>·{entry.hours}h</span>}
                      </button>
                    </CellEditor>
                  </td>
                )
              })}
            </tr>
          </tbody>
        </table>
      </div>

      {/* No entries message for future month */}
      {entries.length === 0 && (
        <p className='text-muted-foreground text-sm'>No entries yet for this month.</p>
      )}

      {/* Summary */}
      <div className='flex gap-6 text-sm'>
        <span><strong>{summary.hoursWorked}h</strong> worked</span>
        <span><strong>{summary.vacationDays}</strong> vacation</span>
        <span><strong>{summary.sickDays}</strong> sick</span>
        <span><strong>{summary.tickets}</strong> tickets</span>
      </div>

      {/* Save */}
      <Button onClick={handleSave} disabled={isSaving || !isDirty}>
        {isSaving ? 'Saving…' : 'Save'}
      </Button>

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
