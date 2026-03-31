import { useEffect, useState } from 'react'
import { startRegistration } from '@simplewebauthn/browser'
import { CheckCircle2, Loader2, XCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  validateMagicToken,
  getWebAuthnRegisterOptions,
  verifyWebAuthnRegistration,
  completeDeviceRegistration,
} from '@/lib/mongoApi'

type PageState =
  | { status: 'loading' }
  | { status: 'ready'; employeeName: string }
  | { status: 'registering' }
  | { status: 'success' }
  | { status: 'error'; message: string }

export default function RegisterDevice() {
  const token = new URLSearchParams(window.location.search).get('token') ?? ''
  const [state, setState] = useState<PageState>({ status: 'loading' })
  const [deviceName, setDeviceName] = useState('')

  useEffect(() => {
    if (!token) {
      setState({ status: 'error', message: 'No token provided.' })
      return
    }
    validateMagicToken(token)
      .then(({ employeeName }) => setState({ status: 'ready', employeeName }))
      .catch(() =>
        setState({ status: 'error', message: 'This link is invalid or has expired.' })
      )
  }, [token])

  const handleRegister = async () => {
    setState({ status: 'registering' })
    try {
      const options = await getWebAuthnRegisterOptions(token)
      const response = await startRegistration({ optionsJSON: options as never })
      await verifyWebAuthnRegistration(response, deviceName.trim() || undefined, token)
      await completeDeviceRegistration(token)
      setState({ status: 'success' })
      setTimeout(() => {
        window.location.href = '/'
      }, 1500)
    } catch (err) {
      setState({
        status: 'error',
        message: err instanceof Error ? err.message : 'Registration failed.',
      })
    }
  }

  return (
    <div className='min-h-screen flex items-center justify-center bg-background p-4'>
      <div className='w-full max-w-sm space-y-6 text-center'>
        {state.status === 'loading' && (
          <Loader2 className='mx-auto h-8 w-8 animate-spin text-muted-foreground' />
        )}

        {state.status === 'ready' && (
          <>
            <div className='space-y-1'>
              <h1 className='text-2xl font-semibold tracking-tight'>Register this device</h1>
              <p className='text-sm text-muted-foreground'>for {state.employeeName}</p>
            </div>
            <div className='text-left space-y-1'>
              <Label htmlFor='device-name'>
                Device Name <span className='text-muted-foreground font-normal'>(optional)</span>
              </Label>
              <Input
                id='device-name'
                value={deviceName}
                onChange={e => setDeviceName(e.target.value)}
                placeholder='e.g. iPhone Face ID'
              />
            </div>
            <Button className='w-full' onClick={handleRegister}>
              Register Device
            </Button>
          </>
        )}

        {state.status === 'registering' && (
          <>
            <Loader2 className='mx-auto h-8 w-8 animate-spin' />
            <p className='text-sm text-muted-foreground'>Waiting for biometric confirmation…</p>
          </>
        )}

        {state.status === 'success' && (
          <>
            <CheckCircle2 className='mx-auto h-10 w-10 text-green-500' />
            <p className='text-sm text-muted-foreground'>Device registered! Redirecting…</p>
          </>
        )}

        {state.status === 'error' && (
          <>
            <XCircle className='mx-auto h-10 w-10 text-destructive' />
            <p className='font-medium'>{state.message}</p>
            <a
              href='/login'
              className='text-sm text-muted-foreground underline underline-offset-4'
            >
              Back to login
            </a>
          </>
        )}
      </div>
    </div>
  )
}
