import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'

export default function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useAuth()
  const { pathname } = useLocation()

  if (isLoading) {
    return (
      <div className='flex h-screen items-center justify-center text-muted-foreground text-sm'>
        Loading…
      </div>
    )
  }

  if (!user) return <Navigate to='/login' replace />

  // Force password change before accessing any other page
  if (user.mustChangePassword && pathname !== '/change-password') {
    return <Navigate to='/change-password' replace />
  }

  return <>{children}</>
}
