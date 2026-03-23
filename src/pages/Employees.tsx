import {useState} from 'react'
import {useNavigate, Navigate} from 'react-router-dom'
import {getSessionEmployee} from '@/lib/session'
import {Table, TableBody, TableCell, TableHead, TableHeader, TableRow} from '@/components/ui/table'
import {Badge} from '@/components/ui/badge'
import {Button} from '@/components/ui/button'
import {Input} from '@/components/ui/input'
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
import {Switch} from '@/components/ui/switch'
import {Select, SelectContent, SelectItem, SelectTrigger, SelectValue} from '@/components/ui/select'
import {Tabs, TabsContent, TabsList, TabsTrigger} from '@/components/ui/tabs'
import {useEmployees} from '@/hooks/useEmployees'
import {useUpdateEmployee} from '@/hooks/useEmployeeMutations'
import {useClosures, useCreateClosure, useDeleteClosure} from '@/hooks/useClosures'
import EmployeeModal from '@/components/EmployeeModal'
import type {Employee} from '@/lib/schemas'

export default function Employees() {
  const sessionEmployee = getSessionEmployee()
  const navigate = useNavigate()

  // All hooks must be called before any conditional return
  const { data: employees, isLoading, isError, refetch } = useEmployees()
  const { mutate: updateEmployee, isPending: updatePending } = useUpdateEmployee()
  const { data: closures } = useClosures()
  const { mutate: createClosure, isPending: createPending } = useCreateClosure()
  const { mutate: deleteClosure } = useDeleteClosure()

  const [modalOpen, setModalOpen] = useState(false)
  const [editTarget, setEditTarget] = useState<Employee | null>(null)
  const [deactivateTarget, setDeactivateTarget] = useState<Employee | null>(null)
  const [reactivateTarget, setReactivateTarget] = useState<Employee | null>(null)
  const [closureYear, setClosureYear] = useState(new Date().getFullYear())
  const [newDate, setNewDate] = useState('')
  const [newEndDate, setNewEndDate] = useState('')
  const [newNote, setNewNote] = useState('')

  if (!sessionEmployee || !sessionEmployee.isAdmin) return <Navigate to='/' replace />

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
            <button onClick={() => refetch()} className='underline'>Retry</button>
          </AlertDescription>
        </Alert>
      </div>
    )
  }

  const sessionId = sessionEmployee._id

  const handleEdit = (emp: Employee) => { setEditTarget(emp); setModalOpen(true) }

  const handleDeactivateConfirm = () => {
    if (!deactivateTarget) return
    updateEmployee({ ...deactivateTarget, isActive: false }, { onSuccess: () => setDeactivateTarget(null) })
  }

  const handleReactivateConfirm = () => {
    if (!reactivateTarget) return
    updateEmployee({ ...reactivateTarget, isActive: true }, { onSuccess: () => setReactivateTarget(null) })
  }

  const handleAddClosure = () => {
    if (!newDate) return
    createClosure(
      { date: newDate, endDate: newEndDate || undefined, note: newNote.trim() || null },
      { onSuccess: () => { setNewDate(''); setNewEndDate(''); setNewNote('') } }
    )
  }

  return (
    <div className='min-h-screen bg-gray-50'>
      <header className='bg-white border-b px-6 py-4 flex items-center justify-between shadow-sm'>
        <h1 className='text-xl font-semibold'>Settings</h1>
        <Button variant='outline' onClick={() => navigate('/attendance')}>Back</Button>
      </header>

      <main className='p-6'>
        <div className='bg-white rounded-2xl shadow-sm p-6'>
          <Tabs defaultValue='employees'>
            <TabsList className='mb-6'>
              <TabsTrigger value='employees'>Employees</TabsTrigger>
              <TabsTrigger value='holidays'>Holidays</TabsTrigger>
            </TabsList>

            {/* ── Employees tab ── */}
            <TabsContent value='employees'>
              <div className='flex justify-end mb-4'>
                <Button onClick={() => { setEditTarget(null); setModalOpen(true) }}>
                  Add Employee
                </Button>
              </div>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Std. Hours</TableHead>
                    <TableHead>Admin</TableHead>
                    <TableHead>Tickets</TableHead>
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
                          <Switch
                            checked={emp.hasTickets}
                            disabled={updatePending}
                            onCheckedChange={(checked) => updateEmployee({ ...emp, hasTickets: checked })}
                          />
                        </TableCell>
                        <TableCell>
                          <Badge className={isInactive ? 'bg-gray-100 text-gray-600' : 'bg-green-100 text-green-700'}>
                            {isInactive ? 'Inactive' : 'Active'}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <div className='flex gap-2'>
                            <Button size='sm' variant='outline' onClick={() => handleEdit(emp)}>Edit</Button>
                            {isInactive ? (
                              <Button size='sm' variant='ghost' onClick={() => setReactivateTarget(emp)}>
                                Activate
                              </Button>
                            ) : (
                              <Button
                                size='sm'
                                variant='destructive'
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
            </TabsContent>

            {/* ── Holidays tab ── */}
            <TabsContent value='holidays'>
              <div className='flex items-center gap-4 mb-4'>
                <Select value={String(closureYear)} onValueChange={v => setClosureYear(Number(v))}>
                  <SelectTrigger className='w-24'>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {[closureYear - 1, closureYear, closureYear + 1].map(y => (
                      <SelectItem key={y} value={String(y)}>{y}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Start Date</TableHead>
                    <TableHead>End Date</TableHead>
                    <TableHead>Note</TableHead>
                    <TableHead></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(closures ?? []).filter(c => c.date.startsWith(String(closureYear))).map(c => (
                    <TableRow key={c._id}>
                      <TableCell className='font-medium'>{c.date}</TableCell>
                      <TableCell className='text-muted-foreground'>{c.endDate ?? '—'}</TableCell>
                      <TableCell className='text-muted-foreground'>{c.note ?? '—'}</TableCell>
                      <TableCell>
                        <Button size='sm' variant='destructive' onClick={() => deleteClosure(c._id)}>
                          Remove
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                  <TableRow>
                    <TableCell>
                      <Input type='date' value={newDate} onChange={e => setNewDate(e.target.value)} className='w-40' />
                    </TableCell>
                    <TableCell>
                      <Input type='date' value={newEndDate} onChange={e => setNewEndDate(e.target.value)} className='w-40' />
                    </TableCell>
                    <TableCell>
                      <Input value={newNote} onChange={e => setNewNote(e.target.value)} placeholder='Note (optional)' className='w-48' />
                    </TableCell>
                    <TableCell>
                      <Button size='sm' onClick={handleAddClosure} disabled={!newDate || createPending}>Add</Button>
                    </TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </TabsContent>
          </Tabs>
        </div>
      </main>

      <EmployeeModal open={modalOpen} onClose={() => setModalOpen(false)} employee={editTarget} />

      <AlertDialog open={deactivateTarget !== null}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Deactivate {deactivateTarget?.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              They will no longer appear in the employee selector. Their attendance data will be preserved.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setDeactivateTarget(null)}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeactivateConfirm} disabled={updatePending}>Deactivate</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={reactivateTarget !== null}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Reactivate {reactivateTarget?.name}?</AlertDialogTitle>
            <AlertDialogDescription>They will appear again in the employee selector.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setReactivateTarget(null)}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleReactivateConfirm} disabled={updatePending}>Reactivate</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
