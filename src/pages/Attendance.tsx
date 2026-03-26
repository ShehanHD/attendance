import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Menu, User } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import AttendanceGrid from '@/components/AttendanceGrid'
import ProfileModal from '@/components/ProfileModal'
import { useClosures } from '@/hooks/useClosures'
import { useEmployees } from '@/hooks/useEmployees'
import { useAuth } from '@/contexts/AuthContext'
import { Alert, AlertDescription } from '@/components/ui/alert'
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
import type { Employee } from '@/lib/schemas'

export default function Attendance() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const { data: closures, isLoading: closuresLoading, isError: closuresError, refetch } = useClosures()
  const { data: employees } = useEmployees()

  // Track dirty state per-employee (for both single and all-employees views)
  const [dirtyIds, setDirtyIds] = useState<Set<string>>(new Set())
  const [pendingAction, setPendingAction] = useState<(() => void) | null>(null)
  const [viewingId, setViewingId] = useState<string | null>(null) // null = own, '__all__' = all
  const [profileOpen, setProfileOpen] = useState(false)

  if (!user) return null

  const activeEmployees = (employees ?? []).filter(e => e.isActive !== false)
  const viewingEmployee: Employee = (viewingId && viewingId !== '__all__'
    ? activeEmployees.find(e => e._id === viewingId)
    : undefined) ?? user

  const hasDirty = dirtyIds.size > 0

  const guardedAction = (action: () => void) => {
    if (hasDirty) setPendingAction(() => action)
    else action()
  }

  const handleDirtyChange = (employeeId: string, dirty: boolean) => {
    setDirtyIds(prev => {
      const next = new Set(prev)
      if (dirty) next.add(employeeId)
      else next.delete(employeeId)
      return next
    })
  }

  const handleEmployeeChange = (val: string) => {
    if (val === '__all__') {
      guardedAction(() => {
        setViewingId('__all__')
        setDirtyIds(new Set())
      })
    } else {
      guardedAction(() => {
        setViewingId(val === user._id ? null : val)
        setDirtyIds(new Set())
      })
    }
  }

  const handleLogout = () => {
    guardedAction(async () => {
      await logout()
      navigate('/login', { replace: true })
    })
  }

  if (closuresLoading) {
    return (
      <div className='flex min-h-screen items-center justify-center'>
        <p className='text-muted-foreground'>Loading…</p>
      </div>
    )
  }

  if (closuresError) {
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

  return (
    <div className='min-h-screen bg-gray-50'>
      <header className='bg-white border-b px-4 sm:px-6 py-3 sm:py-4 flex items-center justify-between shadow-sm gap-3'>
        <div className='flex items-center gap-3 min-w-0 flex-1'>
          <h1 className='text-lg sm:text-xl font-semibold flex-shrink-0'>Attendance</h1>
          {user.isAdmin && activeEmployees.length > 0 && (
            <Select
              value={viewingId ?? user._id}
              onValueChange={handleEmployeeChange}
            >
              <SelectTrigger className='w-36 sm:w-44'>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {activeEmployees.map(emp => (
                  <SelectItem key={emp._id} value={emp._id}>{emp.name}</SelectItem>
                ))}
                <SelectItem value='__all__'>— All employees —</SelectItem>
              </SelectContent>
            </Select>
          )}
          {!user.isAdmin && (
            <p className='text-sm text-muted-foreground truncate'>{user.name}</p>
          )}
        </div>

        <div className='flex items-center gap-2 flex-shrink-0'>
          {/* Desktop nav buttons */}
          {user.isAdmin && (
            <>
              <Button variant='outline' className='hidden sm:flex' onClick={() => guardedAction(() => navigate('/summary'))}>
                Summary
              </Button>
              <Button variant='outline' className='hidden sm:flex' onClick={() => guardedAction(() => navigate('/employees'))}>
                Settings
              </Button>
            </>
          )}
          <Button variant='outline' className='hidden sm:flex gap-1.5' onClick={() => setProfileOpen(true)}>
            <User className='h-4 w-4' />{user.name}
          </Button>
          <Button variant='outline' className='hidden sm:flex' onClick={handleLogout}>
            Sign out
          </Button>

          {/* Mobile: single hamburger menu */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant='outline' size='icon' className='sm:hidden'>
                <Menu className='h-5 w-5' />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align='end' className='w-48'>
              <DropdownMenuItem onClick={() => setProfileOpen(true)}>
                <User className='h-4 w-4 mr-2' />Profile
              </DropdownMenuItem>
              {user.isAdmin && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => guardedAction(() => navigate('/summary'))}>
                    Summary
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => guardedAction(() => navigate('/employees'))}>
                    Settings
                  </DropdownMenuItem>
                </>
              )}
              <DropdownMenuSeparator />
              <DropdownMenuItem className='text-destructive focus:text-destructive' onClick={handleLogout}>
                Sign out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>

      <main className='p-3 sm:p-6'>
        {viewingId === '__all__' ? (
          <div className='space-y-6'>
            {activeEmployees.map(emp => (
              <div key={emp._id} className='bg-white rounded-2xl shadow-sm p-3 sm:p-6'>
                <h2 className='text-base font-semibold mb-4'>{emp.name}</h2>
                <AttendanceGrid
                  employee={emp}
                  closures={closures ?? []}
                  onDirtyChange={dirty => handleDirtyChange(emp._id, dirty)}
                />
              </div>
            ))}
          </div>
        ) : (
          <div className='bg-white rounded-2xl shadow-sm p-3 sm:p-6'>
            <AttendanceGrid
              employee={viewingEmployee}
              closures={closures ?? []}
              onDirtyChange={dirty => handleDirtyChange(viewingEmployee._id, dirty)}
            />
          </div>
        )}
      </main>

      <ProfileModal open={profileOpen} onClose={() => setProfileOpen(false)} />

      <AlertDialog open={pendingAction !== null}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Unsaved changes</AlertDialogTitle>
            <AlertDialogDescription>
              You have unsaved changes. Leave without saving?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setPendingAction(null)}>Stay</AlertDialogCancel>
            <AlertDialogAction onClick={() => { pendingAction?.(); setPendingAction(null) }}>Leave</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
