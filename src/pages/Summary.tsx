import { useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { useQuery } from '@tanstack/react-query'
import { useEmployees } from '@/hooks/useEmployees'
import { useAuth } from '@/contexts/AuthContext'
import SummaryTable from '@/components/SummaryTable'
import { fetchAllEntriesForMonth } from '@/lib/mongoApi'

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

export default function Summary() {
  const { user } = useAuth()
  const navigate = useNavigate()

  const now = new Date()
  const currentYear = now.getFullYear()
  const YEARS = [currentYear - 1, currentYear, currentYear + 1]

  const [month, setMonth] = useState(now.getMonth() + 1)
  const [year, setYear] = useState(currentYear)

  const { data: employees, isLoading: empLoading, isError: empError } = useEmployees()

  const {
    data: allEntries,
    isLoading: entriesLoading,
    isError: entriesError,
    refetch,
  } = useQuery({
    queryKey: ['summary-entries', year, month],
    queryFn: () => fetchAllEntriesForMonth(year, month),
    enabled: user !== null && user.isAdmin === true,
  })

  // Route guards — AFTER all hooks
  if (!user || !user.isAdmin) return <Navigate to='/' replace />

  const isLoading = empLoading || entriesLoading
  const isError = empError || entriesError

  if (isLoading) {
    return (
      <div className='flex min-h-screen items-center justify-center'>
        <p className='text-muted-foreground'>Loading…</p>
      </div>
    )
  }

  if (isError) {
    return (
      <div className='flex min-h-screen items-center justify-center p-8'>
        <Alert variant='destructive' className='max-w-md'>
          <AlertDescription>
            Failed to load summary data.{' '}
            <button onClick={() => refetch()} className='underline'>Retry</button>
          </AlertDescription>
        </Alert>
      </div>
    )
  }

  return (
    <div className='min-h-screen bg-background'>
      <header className='border-b px-4 sm:px-6 py-3 sm:py-4 flex items-center justify-between gap-3'>
        <h1 className='text-lg sm:text-xl font-semibold'>Summary</h1>
        <Button variant='outline' onClick={() => navigate('/attendance')}>
          Back
        </Button>
      </header>

      <main className='p-4 sm:p-6 space-y-4'>
        <div className='flex gap-3'>
          <Select value={String(month)} onValueChange={v => setMonth(Number(v))}>
            <SelectTrigger className='w-36'>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {MONTHS.map((name, i) => (
                <SelectItem key={i + 1} value={String(i + 1)}>{name}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={String(year)} onValueChange={v => setYear(Number(v))}>
            <SelectTrigger className='w-24'>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {YEARS.map(y => (
                <SelectItem key={y} value={String(y)}>{y}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className='overflow-x-auto rounded-lg border'>
          <SummaryTable employees={employees ?? []} allEntries={allEntries ?? []} />
        </div>
      </main>
    </div>
  )
}
