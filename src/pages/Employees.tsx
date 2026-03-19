import {useState} from 'react'
import {useNavigate} from 'react-router-dom'
import {Table, TableBody, TableCell, TableHead, TableHeader, TableRow,} from '@/components/ui/table'
import {Badge} from '@/components/ui/badge'
import {Button} from '@/components/ui/button'
import {Alert, AlertDescription} from '@/components/ui/alert'
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
import {useEmployees} from '@/hooks/useEmployees'
import {useUpdateEmployee} from '@/hooks/useEmployeeMutations'
import EmployeeModal from '@/components/EmployeeModal'
import type {Employee} from '@/lib/schemas'

export default function Employees() {
  // const employee = getSessionEmployee()
  const navigate = useNavigate()
  const { data: employees, isLoading, isError, refetch } = useEmployees()
  const { mutate: updateEmployee, isPending: updatePending } = useUpdateEmployee()

  const [modalOpen, setModalOpen] = useState(false)
  const [editTarget, setEditTarget] = useState<Employee | null>(null)
  const [deactivateTarget, setDeactivateTarget] = useState<Employee | null>(null)
  const [reactivateTarget, setReactivateTarget] = useState<Employee | null>(null)

  // Route guard — after all hooks
  // if (!employee || !employee.isAdmin) return <Navigate to='/' replace />

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
            Failed to load employees.{' '}
            <button onClick={() => refetch()} className='underline'>
              Retry
            </button>
          </AlertDescription>
        </Alert>
      </div>
    )
  }

  const sessionId = "0"//employee._id

  const handleAdd = () => {
    setEditTarget(null)
    setModalOpen(true)
  }

  const handleEdit = (emp: Employee) => {
    setEditTarget(emp)
    setModalOpen(true)
  }

  const handleDeactivateConfirm = () => {
    if (!deactivateTarget) return
    updateEmployee(
      { ...deactivateTarget, isActive: false },
      { onSuccess: () => setDeactivateTarget(null) }
    )
  }

  const handleReactivateConfirm = () => {
    if (!reactivateTarget) return
    updateEmployee(
      { ...reactivateTarget, isActive: true },
      { onSuccess: () => setReactivateTarget(null) }
    )
  }

  return (
    <div className='min-h-screen bg-background'>
      <header className='border-b px-6 py-4 flex items-center justify-between'>
        <h1 className='text-xl font-semibold'>Employees</h1>
        <div className='flex gap-2'>
          <Button onClick={handleAdd}>Add Employee</Button>
          <Button variant='outline' onClick={() => navigate('/attendance')}>
            Back
          </Button>
        </div>
      </header>

      <main className='p-6'>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Std. Hours</TableHead>
              <TableHead>Admin</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {(employees ?? []).map((emp) => {
              const isInactive = emp.isActive === false
              const cellClass = isInactive ? 'text-muted-foreground' : ''
              return (
                <TableRow key={emp._id}>
                  <TableCell className={`font-medium ${cellClass}`}>{emp.name}</TableCell>
                  <TableCell className={cellClass}>{emp.standardHours}h</TableCell>
                  <TableCell className={cellClass}>{emp.isAdmin ? 'Yes' : '—'}</TableCell>
                  <TableCell>
                    <Badge variant={isInactive ? 'secondary' : 'default'}>
                      {isInactive ? 'Inactive' : 'Active'}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <div className='flex gap-2'>
                      <Button size='sm' variant='outline' onClick={() => handleEdit(emp)}>
                        Edit
                      </Button>
                      {isInactive ? (
                        <Button
                          size='sm'
                          variant='ghost'
                          onClick={() => setReactivateTarget(emp)}
                        >
                          Activate
                        </Button>
                      ) : (
                        <Button
                          size='sm'
                          variant='ghost'
                          onClick={() => setDeactivateTarget(emp)}
                          disabled={emp._id === sessionId}
                          title={emp._id === sessionId ? 'Cannot deactivate your own account' : undefined}
                        >
                          Deactivate
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      </main>

      <EmployeeModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        employee={editTarget}
      />

      {/* Deactivate confirmation */}
      <AlertDialog open={deactivateTarget !== null}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Deactivate {deactivateTarget?.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              They will no longer appear in the employee selector. Their attendance data will be
              preserved.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setDeactivateTarget(null)}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeactivateConfirm} disabled={updatePending}>
              Deactivate
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Reactivate confirmation */}
      <AlertDialog open={reactivateTarget !== null}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Reactivate {reactivateTarget?.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              They will appear again in the employee selector.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setReactivateTarget(null)}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleReactivateConfirm} disabled={updatePending}>
              Reactivate
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
