import { useEffect, useState } from 'react'
import { Loader2, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useAuth } from '@/contexts/AuthContext'
import { fetchWebAuthnCredentials, deleteWebAuthnCredential, sendDeviceRegistrationLink } from '@/lib/mongoApi'
import type { BiometricDevice } from '@/lib/schemas'

interface Props {
  open: boolean
  onClose: () => void
}

export default function ProfileModal({ open, onClose }: Props) {
  const { user, changePassword, registerBiometric } = useAuth()

  // Change password state
  const [current, setCurrent] = useState('')
  const [newPwd, setNewPwd] = useState('')
  const [confirm, setConfirm] = useState('')
  const [savingPwd, setSavingPwd] = useState(false)

  // Biometric state
  const [deviceName, setDeviceName] = useState('')
  const [registeringBio, setRegisteringBio] = useState(false)
  const [devices, setDevices] = useState<BiometricDevice[]>([])
  const [devicesLoading, setDevicesLoading] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [sendingLink, setSendingLink] = useState(false)

  // Load registered devices whenever modal opens
  useEffect(() => {
    if (!open) return
    setDevicesLoading(true)
    fetchWebAuthnCredentials()
      .then(setDevices)
      .catch(() => setDevices([]))
      .finally(() => setDevicesLoading(false))
  }, [open])

  const resetPasswordForm = () => {
    setCurrent('')
    setNewPwd('')
    setConfirm('')
  }

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault()
    if (newPwd !== confirm) {
      toast.error('Passwords do not match')
      return
    }
    if (newPwd.length < 8) {
      toast.error('Password must be at least 8 characters')
      return
    }
    setSavingPwd(true)
    try {
      await changePassword(current || undefined, newPwd)
      toast.success('Password changed successfully')
      resetPasswordForm()
    } catch (err) {
      toast.error('Failed to change password', {
        description: err instanceof Error ? err.message : 'Unknown error',
      })
    } finally {
      setSavingPwd(false)
    }
  }

  const handleRegisterBiometric = async () => {
    setRegisteringBio(true)
    try {
      await registerBiometric(deviceName.trim() || undefined)
      toast.success('Biometric registered successfully')
      setDeviceName('')
      // Reload device list
      const updated = await fetchWebAuthnCredentials()
      setDevices(updated)
    } catch (err) {
      toast.error('Failed to register biometric', {
        description: err instanceof Error ? err.message : 'Unknown error',
      })
    } finally {
      setRegisteringBio(false)
    }
  }

  const handleDeleteDevice = async (id: string) => {
    setDeletingId(id)
    try {
      await deleteWebAuthnCredential(id)
      setDevices(prev => prev.filter(d => d._id !== id))
      toast.success('Device removed')
    } catch (err) {
      toast.error('Failed to remove device', {
        description: err instanceof Error ? err.message : 'Unknown error',
      })
    } finally {
      setDeletingId(null)
    }
  }

  const handleSendLink = async () => {
    setSendingLink(true)
    try {
      await sendDeviceRegistrationLink()
      toast.success('Registration link sent to your email')
    } catch (err) {
      toast.error('Failed to send link', {
        description: err instanceof Error ? err.message : 'Unknown error',
      })
    } finally {
      setSendingLink(false)
    }
  }

  const handleOpenChange = (v: boolean) => {
    if (!v) {
      resetPasswordForm()
      setDeviceName('')
      onClose()
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className='sm:max-w-md'>
        <DialogHeader>
          <DialogTitle>{user?.name ?? 'Profile'}</DialogTitle>
        </DialogHeader>

        <div className='space-y-6 py-2'>
          {/* Change Password */}
          <section className='space-y-3'>
            <h3 className='text-sm font-semibold text-muted-foreground uppercase tracking-wide'>
              Change Password
            </h3>
            <form onSubmit={handleChangePassword} className='space-y-3'>
              <div className='space-y-1'>
                <Label htmlFor='profile-current'>Current Password</Label>
                <Input
                  id='profile-current'
                  type='password'
                  value={current}
                  onChange={e => setCurrent(e.target.value)}
                  autoComplete='current-password'
                  required
                />
              </div>
              <div className='space-y-1'>
                <Label htmlFor='profile-new'>New Password</Label>
                <Input
                  id='profile-new'
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
                <Label htmlFor='profile-confirm'>Confirm New Password</Label>
                <Input
                  id='profile-confirm'
                  type='password'
                  value={confirm}
                  onChange={e => setConfirm(e.target.value)}
                  autoComplete='new-password'
                  required
                />
              </div>
              <Button type='submit' className='w-full' disabled={savingPwd}>
                {savingPwd && <Loader2 className='mr-2 h-4 w-4 animate-spin' />}
                {savingPwd ? 'Saving…' : 'Change Password'}
              </Button>
            </form>
          </section>

          <div className='border-t' />

          {/* Biometric / Passkeys */}
          <section className='space-y-3'>
            <h3 className='text-sm font-semibold text-muted-foreground uppercase tracking-wide'>
              Biometric / Passkeys
            </h3>

            {/* Registered devices list */}
            {devicesLoading ? (
              <p className='text-sm text-muted-foreground flex items-center gap-2'>
                <Loader2 className='h-3 w-3 animate-spin' /> Loading devices…
              </p>
            ) : devices.length === 0 ? (
              <p className='text-sm text-muted-foreground'>No devices registered yet.</p>
            ) : (
              <ul className='space-y-2'>
                {devices.map(device => (
                  <li
                    key={device._id}
                    className='flex items-center justify-between rounded-md border px-3 py-2 text-sm'
                  >
                    <div>
                      <p className='font-medium'>{device.deviceName}</p>
                      <p className='text-xs text-muted-foreground'>
                        Registered {new Date(device.createdAt).toLocaleDateString()}
                      </p>
                    </div>
                    <Button
                      type='button'
                      variant='ghost'
                      size='icon'
                      className='text-destructive hover:text-destructive hover:bg-destructive/10'
                      disabled={deletingId === device._id}
                      onClick={() => handleDeleteDevice(device._id)}
                    >
                      {deletingId === device._id
                        ? <Loader2 className='h-4 w-4 animate-spin' />
                        : <Trash2 className='h-4 w-4' />}
                    </Button>
                  </li>
                ))}
              </ul>
            )}

            {/* Register a new device */}
            <div className='space-y-1'>
              <Label htmlFor='profile-device'>
                Device Name <span className='text-muted-foreground font-normal'>(optional)</span>
              </Label>
              <Input
                id='profile-device'
                value={deviceName}
                onChange={e => setDeviceName(e.target.value)}
                placeholder='e.g. MacBook Touch ID'
              />
            </div>
            <Button
              type='button'
              variant='outline'
              className='w-full'
              disabled={registeringBio}
              onClick={handleRegisterBiometric}
            >
              {registeringBio && <Loader2 className='mr-2 h-4 w-4 animate-spin' />}
              {registeringBio ? 'Waiting for biometric…' : 'Register New Device'}
            </Button>
            <Button
              type='button'
              variant='ghost'
              className='w-full text-muted-foreground'
              disabled={sendingLink}
              onClick={handleSendLink}
            >
              {sendingLink && <Loader2 className='mr-2 h-4 w-4 animate-spin' />}
              {sendingLink ? 'Sending…' : 'Send registration link to my email'}
            </Button>
          </section>
        </div>
      </DialogContent>
    </Dialog>
  )
}
