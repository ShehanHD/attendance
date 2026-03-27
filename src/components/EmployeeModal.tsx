import { useEffect, useRef, useState } from 'react'
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useCreateEmployee, useUpdateEmployee } from '@/hooks/useEmployeeMutations'
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
  const [employmentType, setEmploymentType] = useState<'8' | '4'>('8')
  const [isAdmin, setIsAdmin] = useState(false)
  const [email, setEmail] = useState('')
  const [defaultPassword, setDefaultPassword] = useState('')
  const [passwordGenerated, setPasswordGenerated] = useState(false)
  const [passwordCopied, setPasswordCopied] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const copyTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const isPending = createPending || updatePending
  const isEdit = employee !== null

  useEffect(() => {
    if (open) {
      setName(employee?.name ?? '')
      setEmploymentType(employee?.standardHours === 4 ? '4' : '8')
      setIsAdmin(employee?.isAdmin ?? false)
      setEmail('')
      setDefaultPassword('')
      setPasswordGenerated(false)
      setPasswordCopied(false)
      setError(null)
    } else {
      // Clear pending copy timeout when modal closes
      if (copyTimeoutRef.current) {
        clearTimeout(copyTimeoutRef.current)
        copyTimeoutRef.current = null
      }
    }
  }, [open, employee])

  const handleGeneratePassword = () => {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789'
    const bytes = crypto.getRandomValues(new Uint8Array(12))
    const pwd = Array.from(bytes).map(b => chars[b % chars.length]).join('')
    setDefaultPassword(pwd)
    setPasswordGenerated(true)
    setPasswordCopied(false)
  }

  const handleCopyPassword = async () => {
    try {
      await navigator.clipboard.writeText(defaultPassword)
      setPasswordCopied(true)
      copyTimeoutRef.current = setTimeout(() => setPasswordCopied(false), 2000)
    } catch {
      // clipboard denied — don't show "Copied!"
    }
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) {
      setError('Name is required')
      return
    }
    setError(null)

    const standardHours = Number(employmentType)
    const hasTickets = employmentType === '8'

    if (isEdit && employee) {
      update(
        { ...employee, name: name.trim(), standardHours, isAdmin, hasTickets },
        { onSuccess: () => onClose() }
      )
    } else {
      const payload: Parameters<typeof create>[0] = { name: name.trim(), standardHours, isAdmin, hasTickets }
      if (email.trim()) payload.email = email.trim()
      if (defaultPassword) payload.password = defaultPassword
      create(payload, { onSuccess: () => onClose() })
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
              <Label htmlFor='emp-type'>Employment Type</Label>
              <Select value={employmentType} onValueChange={(v) => setEmploymentType(v as '8' | '4')}>
                <SelectTrigger id='emp-type'>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value='8'>Full-Time (8 hours)</SelectItem>
                  <SelectItem value='4'>Part-Time (4 hours)</SelectItem>
                </SelectContent>
              </Select>
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
            {!isEdit && (
              <>
                <div className='space-y-1'>
                  <Label htmlFor='emp-email'>Email <span className='text-muted-foreground font-normal'>(optional)</span></Label>
                  <Input
                    id='emp-email'
                    type='email'
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    placeholder='employee@company.com'
                    autoComplete='off'
                  />
                </div>
                {email.trim() && (
                  <div className='space-y-1'>
                    <div className='flex items-center justify-between'>
                      <Label htmlFor='emp-password'>Default Password</Label>
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
                        id='emp-password'
                        type={passwordGenerated ? 'text' : 'password'}
                        value={defaultPassword}
                        onChange={e => { setDefaultPassword(e.target.value); setPasswordGenerated(false) }}
                        placeholder='Min. 8 characters'
                        autoComplete='new-password'
                        className='font-mono'
                      />
                      {passwordGenerated && (
                        <Button
                          type='button'
                          size='sm'
                          variant='outline'
                          className='shrink-0'
                          onClick={handleCopyPassword}
                        >
                          {passwordCopied ? 'Copied!' : 'Copy'}
                        </Button>
                      )}
                    </div>
                    <p className='text-xs text-muted-foreground'>Employee will be asked to change this on first login.</p>
                  </div>
                )}
              </>
            )}
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
