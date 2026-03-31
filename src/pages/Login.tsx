import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { LogIn, Fingerprint } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useAuth } from '@/contexts/AuthContext'

const supportsWebAuthn =
  typeof window !== 'undefined' && window.PublicKeyCredential !== undefined

export default function Login() {
  const { login, loginWithBiometric } = useAuth()
  const navigate = useNavigate()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isBiometric, setIsBiometric] = useState(false)

  const handlePasswordLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsSubmitting(true)
    try {
      await login(email.trim(), password)
      navigate('/', { replace: true })
    } catch (err) {
      toast.error('Login failed', {
        description: err instanceof Error ? err.message : 'Invalid email or password',
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleBiometricLogin = async () => {
    setIsBiometric(true)
    try {
      await loginWithBiometric()
      navigate('/', { replace: true })
    } catch (err) {
      toast.error('Biometric login failed', {
        description: err instanceof Error ? err.message : 'Authentication failed',
      })
    } finally {
      setIsBiometric(false)
    }
  }

  return (
    <div className='flex min-h-screen items-center justify-center bg-background px-4'>
      <div className='w-full max-w-sm space-y-6'>
        <div className='space-y-1 text-center'>
          <h1 className='text-2xl font-semibold tracking-tight'>Sign in</h1>
          <p className='text-sm text-muted-foreground'>Enter your credentials to continue</p>
        </div>

        <form onSubmit={handlePasswordLogin} className='space-y-4'>
          <div className='space-y-1'>
            <Label htmlFor='email'>Email</Label>
            <Input
              id='email'
              type='email'
              autoComplete='email'
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder='you@company.com'
              required
            />
          </div>
          <div className='space-y-1'>
            <Label htmlFor='password'>Password</Label>
            <Input
              id='password'
              type='password'
              autoComplete='current-password'
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder='••••••••'
              required
            />
          </div>
          <Button type='submit' className='w-full gap-2' disabled={isSubmitting}>
            <LogIn className='h-4 w-4' />{isSubmitting ? 'Signing in…' : 'Sign in'}
          </Button>
        </form>

        {supportsWebAuthn && (
          <>
            <div className='relative'>
              <div className='absolute inset-0 flex items-center'>
                <span className='w-full border-t' />
              </div>
              <div className='relative flex justify-center text-xs'>
                <span className='bg-background px-2 text-muted-foreground'>or</span>
              </div>
            </div>
            <Button
              type='button'
              variant='outline'
              className='w-full'
              disabled={isBiometric}
              onClick={handleBiometricLogin}
            >
              <Fingerprint className='h-4 w-4' />{isBiometric ? 'Waiting for biometric…' : 'Use biometric / passkey'}
            </Button>
          </>
        )}
      </div>
    </div>
  )
}
