import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useAuth } from '@/contexts/AuthContext'

export default function ChangePassword() {
  const { user, changePassword } = useAuth()
  const navigate = useNavigate()

  const [current, setCurrent] = useState('')
  const [newPwd, setNewPwd] = useState('')
  const [confirm, setConfirm] = useState('')
  const [saving, setSaving] = useState(false)

  const mustChange = user?.mustChangePassword ?? false

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (newPwd !== confirm) {
      toast.error('Passwords do not match')
      return
    }
    setSaving(true)
    try {
      await changePassword(mustChange ? undefined : current || undefined, newPwd)
      toast.success('Password changed successfully')
      navigate('/', { replace: true })
    } catch (err) {
      toast.error('Failed to change password', {
        description: err instanceof Error ? err.message : 'Unknown error',
      })
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className='flex min-h-screen items-center justify-center bg-background px-4'>
      <div className='w-full max-w-sm space-y-6'>
        <div className='space-y-1 text-center'>
          <h1 className='text-2xl font-semibold tracking-tight'>Change Password</h1>
          {mustChange && (
            <p className='text-sm text-orange-600 font-medium'>
              You must set a new password before continuing.
            </p>
          )}
        </div>

        <form onSubmit={handleSubmit} className='space-y-4'>
          {!mustChange && (
            <div className='space-y-1'>
              <Label htmlFor='current'>Current Password</Label>
              <Input
                id='current'
                type='password'
                value={current}
                onChange={e => setCurrent(e.target.value)}
                autoComplete='current-password'
                required
              />
            </div>
          )}
          <div className='space-y-1'>
            <Label htmlFor='new'>New Password</Label>
            <Input
              id='new'
              type='password'
              value={newPwd}
              onChange={e => setNewPwd(e.target.value)}
              placeholder='Min. 8 characters'
              autoComplete='new-password'
              minLength={8}
              required
            />
          </div>
          <div className='space-y-1'>
            <Label htmlFor='confirm'>Confirm New Password</Label>
            <Input
              id='confirm'
              type='password'
              value={confirm}
              onChange={e => setConfirm(e.target.value)}
              autoComplete='new-password'
              required
            />
          </div>
          <Button type='submit' className='w-full' disabled={saving}>
            {saving ? 'Saving…' : 'Change Password'}
          </Button>
        </form>
      </div>
    </div>
  )
}
