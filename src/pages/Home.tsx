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
    <div className='flex min-h-screen items-center justify-center bg-gray-50'>
      <div className='flex flex-col gap-5 rounded-2xl border-0 bg-white p-8 shadow-lg w-80'>
        <div>
          <h1 className='text-2xl font-bold'>Attendance</h1>
          <p className='text-sm text-muted-foreground mt-1'>Select your name to continue.</p>
        </div>

        <div className='flex flex-col gap-1.5'>
          <label className='text-xs font-medium text-muted-foreground uppercase tracking-wide'>Employee</label>
          {employees && employees.length === 0 ? (
            <p className='text-muted-foreground text-sm'>No employee records found.</p>
          ) : (
            <EmployeeSelector
              employees={employees ?? []}
              value={selectedId}
              onChange={setSelectedId}
            />
          )}
        </div>

        <Button onClick={handleContinue} disabled={!selectedId} className='w-full h-11'>
          Continue
        </Button>
      </div>
    </div>
  )
}
