import { useEffect, useState } from 'react'
import { Loader2 } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useCreateEmployee, useUpdateEmployee } from '@/hooks/useEmployeeMutations'
import { getSessionEmployee, setSessionEmployee } from '@/lib/session'
import type { Employee } from '@/lib/schemas'

interface Props {
  open: boolean
  onClose: () => void
  /** null = create mode; Employee = edit mode */
  employee: Employee | null
}

export default function EmployeeModal({ open, onClose, employee }: Props) {
  const { mutate: create, isPending: createPending } = useCreateEmployee()
  const { mutate: update, isPending: updatePending } = useUpdateEmployee()

  const [name, setName] = useState('')
  const [standardHours, setStandardHours] = useState('')
  const [isAdmin, setIsAdmin] = useState(false)
  const [hasTickets, setHasTickets] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const isPending = createPending || updatePending
  const isEdit = employee !== null

  useEffect(() => {
    if (open) {
      setName(employee?.name ?? '')
      setStandardHours(employee ? String(employee.standardHours) : '')
      setIsAdmin(employee?.isAdmin ?? false)
      setHasTickets(employee?.hasTickets ?? true)
      setError(null)
    }
  }, [open, employee])

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const hours = Number(standardHours)
    if (!name.trim()) {
      setError('Name is required')
      return
    }
    if (!Number.isInteger(hours) || hours <= 0) {
      setError('Standard hours must be a positive whole number')
      return
    }
    setError(null)

    if (isEdit && employee) {
      update(
        { ...employee, name: name.trim(), standardHours: hours, isAdmin, hasTickets },
        {
          onSuccess: (updated) => {
            if (updated._id === getSessionEmployee()?._id) {
              setSessionEmployee(updated)
            }
            onClose()
          },
        }
      )
    } else {
      create(
        { name: name.trim(), standardHours: hours, isAdmin, hasTickets },
        { onSuccess: () => onClose() }
      )
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className='sm:max-w-md'>
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Edit Employee' : 'Add Employee'}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit}>
          <div className='space-y-4 py-2'>
            <div className='space-y-1'>
              <Label htmlFor='emp-name'>Name</Label>
              <Input
                id='emp-name'
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder='Full name'
                autoFocus
              />
            </div>
            <div className='space-y-1'>
              <Label htmlFor='emp-hours'>Standard Hours / Day</Label>
              <Input
                id='emp-hours'
                type='number'
                min={1}
                step={1}
                value={standardHours}
                onChange={(e) => setStandardHours(e.target.value)}
                placeholder='8'
              />
            </div>
            <div className='flex items-center gap-2'>
              <input
                id='emp-admin'
                type='checkbox'
                className='h-4 w-4 rounded border-input'
                checked={isAdmin}
                onChange={(e) => setIsAdmin(e.target.checked)}
              />
              <Label htmlFor='emp-admin'>Admin</Label>
            </div>
            <div className='flex items-center gap-2'>
              <input
                id='emp-tickets'
                type='checkbox'
                className='h-4 w-4 rounded border-input'
                checked={hasTickets}
                onChange={(e) => setHasTickets(e.target.checked)}
              />
              <Label htmlFor='emp-tickets'>Has Tickets</Label>
            </div>
            {error && <p className='text-sm text-destructive'>{error}</p>}
          </div>
          <DialogFooter className='mt-4'>
            <Button type='button' variant='outline' onClick={onClose} disabled={isPending}>
              Cancel
            </Button>
            <Button type='submit' disabled={isPending}>
              {isPending && <Loader2 className='mr-2 h-4 w-4 animate-spin' />}
              {isEdit ? 'Save' : 'Add'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
