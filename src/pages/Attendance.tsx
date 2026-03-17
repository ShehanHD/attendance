import { useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import AttendanceGrid from '@/components/AttendanceGrid'
import { useClosures } from '@/hooks/useClosures'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { getSessionEmployee } from '@/lib/session'
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

export default function Attendance() {
  const employee = getSessionEmployee()
  const navigate = useNavigate()
  const { data: closures, isLoading, isError, refetch } = useClosures()
  const [isDirty, setIsDirty] = useState(false)
  const [showSummaryGuard, setShowSummaryGuard] = useState(false)
  const [showHomeGuard, setShowHomeGuard] = useState(false)

  // Route guard
  if (!employee) return <Navigate to='/' replace />

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
            Failed to load company closures.{' '}
            <button onClick={() => refetch()} className='underline'>Retry</button>
          </AlertDescription>
        </Alert>
      </div>
    )
  }

  const handleSummaryClick = () => {
    if (isDirty) setShowSummaryGuard(true)
    else navigate('/summary')
  }

  const handleHomeClick = () => {
    if (isDirty) setShowHomeGuard(true)
    else navigate('/')
  }

  return (
    <div className='min-h-screen bg-background'>
      <header className='border-b px-6 py-4 flex items-center justify-between'>
        <div>
          <h1 className='text-xl font-semibold'>Attendance</h1>
          <p className='text-sm text-muted-foreground'>{employee.name}</p>
        </div>
        <div className='flex gap-2'>
          {employee.isAdmin && (
            <Button variant='outline' onClick={handleSummaryClick}>
              View Summary
            </Button>
          )}
          <Button variant='ghost' onClick={handleHomeClick}>
            Change employee
          </Button>
        </div>
      </header>

      <main className='p-6'>
        <AttendanceGrid
          employee={employee}
          closures={closures ?? []}
          onDirtyChange={setIsDirty}
        />
      </main>

      {/* Guard: navigate to Summary */}
      <AlertDialog open={showSummaryGuard}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Unsaved changes</AlertDialogTitle>
            <AlertDialogDescription>
              You have unsaved changes. Leave without saving?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setShowSummaryGuard(false)}>Stay</AlertDialogCancel>
            <AlertDialogAction onClick={() => { setShowSummaryGuard(false); navigate('/summary') }}>Leave</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Guard: navigate home */}
      <AlertDialog open={showHomeGuard}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Unsaved changes</AlertDialogTitle>
            <AlertDialogDescription>
              You have unsaved changes. Leave without saving?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setShowHomeGuard(false)}>Stay</AlertDialogCancel>
            <AlertDialogAction onClick={() => { setShowHomeGuard(false); navigate('/') }}>Leave</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
