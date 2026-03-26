import { SignJWT, jwtVerify } from 'jose'
import type { VercelRequest, VercelResponse } from '@vercel/node'

const COOKIE_NAME = 'auth'
const COOKIE_MAX_AGE = 60 * 60 * 24 * 7 // 7 days

function getSecret(): Uint8Array {
  const secret = process.env.JWT_SECRET
  if (!secret) throw new Error('JWT_SECRET env var is not set')
  return new TextEncoder().encode(secret)
}

export interface AuthPayload {
  employeeId: string
  isAdmin: boolean
}

export async function signJwt(payload: AuthPayload): Promise<string> {
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('7d')
    .sign(getSecret())
}

export async function verifyJwt(token: string): Promise<AuthPayload> {
  const { payload } = await jwtVerify(token, getSecret())
  if (typeof payload.employeeId !== 'string' || typeof payload.isAdmin !== 'boolean') {
    throw new Error('Invalid token payload')
  }
  return { employeeId: payload.employeeId, isAdmin: payload.isAdmin }
}

export function setAuthCookie(res: VercelResponse, token: string): void {
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : ''
  res.setHeader(
    'Set-Cookie',
    `${COOKIE_NAME}=${token}; HttpOnly; Path=/; SameSite=Lax; Max-Age=${COOKIE_MAX_AGE}${secure}`
  )
}

export function clearAuthCookie(res: VercelResponse): void {
  res.setHeader('Set-Cookie', `${COOKIE_NAME}=; HttpOnly; Path=/; SameSite=Lax; Max-Age=0`)
}

// Returns the auth payload or sends a 401 and returns null.
// Call pattern: const auth = await requireAuth(req, res); if (!auth) return
export async function requireAuth(
  req: VercelRequest,
  res: VercelResponse
): Promise<AuthPayload | null> {
  const token = req.cookies?.[COOKIE_NAME]
  if (!token) {
    res.status(401).json({ error: 'Not authenticated' })
    return null
  }
  try {
    return await verifyJwt(token)
  } catch {
    res.status(401).json({ error: 'Invalid or expired session' })
    return null
  }
}
