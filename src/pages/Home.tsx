import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useEmployees } from '@/hooks/useEmployees'
import EmployeeSelector from '@/components/EmployeeSelector'
import { Button } from '@/components/ui/button'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { setSessionEmployee } from '@/lib/session'

export default function Home() {
  const navigate = useNavigate()
  const { data: employees, isLoading, isError, refetch } = useEmployees()
  const [selectedId, setSelectedId] = useState<string | null>(null)

  if (isLoading) {
    return (
      <div className='flex min-h-screen items-center justify-center'>
        <p className='text-muted-foreground'>Loading employees…</p>
      </div>
    )
  }

  if (isError) {
    return (
      <div className='flex min-h-screen items-center justify-center p-8'>
        <Alert variant='destructive' className='max-w-md'>
          <AlertDescription>
            Failed to load employees.{' '}
            <button onClick={() => refetch()} className='underline'>
              Retry
            </button>
          </AlertDescription>
        </Alert>
      </div>
    )
  }

  const handleContinue = () => {
    if (!selectedId || !employees) return
    const employee = employees.find(e => e._id === selectedId)
    if (!employee) return
    setSessionEmployee(employee)
    navigate('/attendance')
  }

  return (
    <div className='flex min-h-screen items-center justify-center bg-background'>
      <div className='flex flex-col gap-6 rounded-lg border bg-card p-8 shadow-sm'>
        <h1 className='text-2xl font-semibold'>Attendance</h1>
        <p className='text-muted-foreground'>Select your name to continue.</p>

        {employees && employees.length === 0 ? (
          <p className='text-muted-foreground'>No employee records found.</p>
        ) : (
          <EmployeeSelector
            employees={employees ?? []}
            value={selectedId}
            onChange={setSelectedId}
          />
        )}

        <Button onClick={handleContinue} disabled={!selectedId}>
          Continue
        </Button>
      </div>
    </div>
  )
}
