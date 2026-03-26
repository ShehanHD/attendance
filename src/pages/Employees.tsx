import {useState} from 'react'
import {Navigate, useNavigate} from 'react-router-dom'
import {toast} from 'sonner'
import {useAuth} from '@/contexts/AuthContext'
import {setEmployeeCredentials} from '@/lib/mongoApi'
import {Table, TableBody, TableCell, TableHead, TableHeader, TableRow} from '@/components/ui/table'
import {Badge} from '@/components/ui/badge'
import {Button} from '@/components/ui/button'
import {Input} from '@/components/ui/input'
import {Label} from '@/components/ui/label'
import {Alert, AlertDescription} from '@/components/ui/alert'
import {Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,} from '@/components/ui/dialog'
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
import {Select, SelectContent, SelectItem, SelectTrigger, SelectValue} from '@/components/ui/select'
import {Tabs, TabsContent, TabsList, TabsTrigger} from '@/components/ui/tabs'
import {useEmployees} from '@/hooks/useEmployees'
import {useUpdateEmployee} from '@/hooks/useEmployeeMutations'
import {useClosures, useCreateClosure, useDeleteClosure} from '@/hooks/useClosures'
import EmployeeModal from '@/components/EmployeeModal'
import type {Employee} from '@/lib/schemas'

export default function Employees() {
  const { user } = useAuth()
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

  // Credentials dialog state
  const [credTarget, setCredTarget] = useState<Employee | null>(null)
  const [credEmail, setCredEmail] = useState('')
  const [credPassword, setCredPassword] = useState('')
  const [credSaving, setCredSaving] = useState(false)
  const [credGenerated, setCredGenerated] = useState(false)
  const [credCopied, setCredCopied] = useState(false)

  if (!user || !user.isAdmin) return <Navigate to='/' replace />

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

  const sessionId = user._id

  const handleEdit = (emp: Employee) => { setEditTarget(emp); setModalOpen(true) }

  const handleOpenCredentials = (emp: Employee) => {
    setCredTarget(emp)
    setCredEmail('')
    setCredPassword('')
    setCredGenerated(false)
    setCredCopied(false)
  }

  const handleGeneratePassword = () => {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789'
    const bytes = crypto.getRandomValues(new Uint8Array(12))
    const pwd = Array.from(bytes).map(b => chars[b % chars.length]).join('')
    setCredPassword(pwd)
    setCredGenerated(true)
    setCredCopied(false)
  }

  const handleCopyPassword = () => {
    navigator.clipboard.writeText(credPassword)
    setCredCopied(true)
    setTimeout(() => setCredCopied(false), 2000)
  }

  const handleSaveCredentials = async () => {
    if (!credTarget) return
    setCredSaving(true)
    try {
      await setEmployeeCredentials(credTarget._id, credEmail, credPassword)
      toast.success('Credentials saved', { description: `Login set for ${credTarget.name}.` })
      setCredTarget(null)
    } catch (err) {
      toast.error('Failed to save credentials', {
        description: err instanceof Error ? err.message : 'Unknown error',
      })
    } finally {
      setCredSaving(false)
    }
  }

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
      <header className='bg-white border-b px-4 sm:px-6 py-3 sm:py-4 flex items-center justify-between shadow-sm'>
        <h1 className='text-lg sm:text-xl font-semibold'>Settings</h1>
        <Button variant='outline' onClick={() => navigate('/attendance')}>Back</Button>
      </header>

      <main className='p-4 sm:p-6'>
        <div className='bg-white rounded-2xl shadow-sm p-4 sm:p-6'>
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
              <div className='overflow-x-auto'>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Std. Hours</TableHead>
                    <TableHead>Admin</TableHead>
                    <TableHead>Tickets</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Login</TableHead>
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
                        <TableCell className={cellClass}>
                          {emp.hasTickets ? '✓' : '✗'}
                        </TableCell>
                        <TableCell>
                          <Badge className={isInactive ? 'bg-gray-100 text-gray-600' : 'bg-green-100 text-green-700'}>
                            {isInactive ? 'Inactive' : 'Active'}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Button size='sm' variant='ghost' onClick={() => handleOpenCredentials(emp)}>
                            Set login
                          </Button>
                        </TableCell>
                        <TableCell>
                          <div className='flex gap-2'>
                            <Button size='sm' variant='outline' onClick={() => handleEdit(emp)}>Edit</Button>
                            {isInactive ? (
                              <Button size='sm' variant='outline' onClick={() => setReactivateTarget(emp)}>
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
              </div>
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
              <div className='overflow-x-auto'>
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
              </div>
            </TabsContent>
          </Tabs>
        </div>
      </main>

      <EmployeeModal open={modalOpen} onClose={() => setModalOpen(false)} employee={editTarget} />

      {/* Set login credentials dialog */}
      <Dialog open={credTarget !== null} onOpenChange={open => { if (!open) setCredTarget(null) }}>
        <DialogContent className='max-w-sm'>
          <DialogHeader>
            <DialogTitle>Set login for {credTarget?.name}</DialogTitle>
          </DialogHeader>
          <div className='space-y-3 py-2'>
            <div className='space-y-1'>
              <Label htmlFor='cred-email'>Email</Label>
              <Input
                id='cred-email'
                type='email'
                value={credEmail}
                onChange={e => setCredEmail(e.target.value)}
                placeholder='employee@company.com'
                autoComplete='off'
              />
            </div>
            <div className='space-y-1'>
              <div className='flex items-center justify-between'>
                <Label htmlFor='cred-password'>Temporary Password</Label>
                <Button
                  type='button'
                  size='sm'
                  variant='ghost'
                  className='h-auto py-0 text-xs text-muted-foreground hover:text-foreground'
                  onClick={handleGeneratePassword}
                >
                  Generate
                </Button>
              </div>
              <div className='flex gap-2'>
                <Input
                  id='cred-password'
                  type={credGenerated ? 'text' : 'password'}
                  value={credPassword}
                  onChange={e => { setCredPassword(e.target.value); setCredGenerated(false) }}
                  placeholder='Min. 8 characters'
                  autoComplete='new-password'
                  className='font-mono'
                />
                {credGenerated && (
                  <Button
                    type='button'
                    size='sm'
                    variant='outline'
                    className='shrink-0'
                    onClick={handleCopyPassword}
                  >
                    {credCopied ? 'Copied!' : 'Copy'}
                  </Button>
                )}
              </div>
              <p className='text-xs text-muted-foreground'>
                Employee will be asked to change this on first login.
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant='outline' onClick={() => setCredTarget(null)} disabled={credSaving}>
              Cancel
            </Button>
            <Button
              onClick={handleSaveCredentials}
              disabled={!credEmail || credPassword.length < 8 || credSaving}
            >
              {credSaving ? 'Saving…' : 'Save'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
