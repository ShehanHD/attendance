import { createContext, useContext, useEffect, useState } from 'react'
import { startRegistration, startAuthentication } from '@simplewebauthn/browser'
import {
  getMe,
  login as apiLogin,
  logout as apiLogout,
  getWebAuthnRegisterOptions,
  verifyWebAuthnRegistration,
  getWebAuthnLoginOptions,
  verifyWebAuthnLogin,
  changePassword as apiChangePassword,
} from '@/lib/mongoApi'
import type { AuthUser } from '@/lib/schemas'

interface AuthContextValue {
  user: AuthUser | null
  isLoading: boolean
  login: (email: string, password: string) => Promise<void>
  logout: () => Promise<void>
  changePassword: (currentPassword: string | undefined, newPassword: string) => Promise<void>
  registerBiometric: (deviceName?: string) => Promise<void>
  loginWithBiometric: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    getMe()
      .then(setUser)
      .catch(() => setUser(null))
      .finally(() => setIsLoading(false))
  }, [])

  const login = async (email: string, password: string) => {
    const u = await apiLogin(email, password)
    setUser(u)
  }

  const logout = async () => {
    await apiLogout()
    setUser(null)
  }

  const changePassword = async (currentPassword: string | undefined, newPassword: string) => {
    await apiChangePassword(currentPassword, newPassword)
    // Refresh user to clear mustChangePassword flag
    const u = await getMe()
    setUser(u)
  }

  const registerBiometric = async (deviceName?: string) => {
    const options = await getWebAuthnRegisterOptions()
    const response = await startRegistration({ optionsJSON: options as never })
    await verifyWebAuthnRegistration(response, deviceName)
  }

  // Discoverable: no email needed — browser shows credential picker
  const loginWithBiometric = async () => {
    const { options, challengeId } = await getWebAuthnLoginOptions()
    const response = await startAuthentication({ optionsJSON: options as never })
    const u = await verifyWebAuthnLogin(challengeId, response)
    setUser(u)
  }

  return (
    <AuthContext.Provider value={{ user, isLoading, login, logout, changePassword, registerBiometric, loginWithBiometric }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider')
  return ctx
}
