import { z } from 'zod'
import bcrypt from 'bcryptjs'
import { ObjectId } from 'mongodb'
import type { VercelRequest, VercelResponse } from '@vercel/node'
import { getDb } from './_db.js'
import { signJwt, verifyJwt, setAuthCookie, clearAuthCookie } from './_auth.js'

const LoginBodySchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
})

const SetCredentialsBodySchema = z.object({
  employeeId: z.string().min(1),
  email: z.string().email(),
  password: z.string().min(8, 'Password must be at least 8 characters'),
})

const ChangePasswordBodySchema = z.object({
  currentPassword: z.string().optional(),
  newPassword: z.string().min(8, 'Password must be at least 8 characters'),
})

function serializeEmployee(doc: Record<string, unknown> & { _id: { toString(): string } }) {
  return {
    _id: doc._id.toString(),
    name: doc.name,
    email: doc.email ?? null,
    isAdmin: !!doc.isAdmin,
    isActive: !!doc.isActive,
    standardHours: doc.standardHours,
    hasTickets: !!doc.hasTickets,
    mustChangePassword: !!doc.mustChangePassword,
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (req.method === 'POST') {
    await handleLogin(req, res)
  } else if (req.method === 'DELETE') {
    await handleLogout(res)
  } else if (req.method === 'GET') {
    await handleMe(req, res)
  } else if (req.method === 'PUT') {
    await handleSetCredentials(req, res)
  } else if (req.method === 'PATCH') {
    await handleChangePassword(req, res)
  } else {
    res.status(405).json({ error: 'Method not allowed' })
  }
}

async function handleLogin(req: VercelRequest, res: VercelResponse): Promise<void> {
  const parsed = LoginBodySchema.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0].message })
    return
  }
  const { email, password } = parsed.data
  try {
    const db = await getDb()
    const doc = await db.collection('employees').findOne({ email: email.toLowerCase() })
    if (!doc || !doc.passwordHash) {
      res.status(401).json({ error: 'Invalid email or password' })
      return
    }
    const valid = await bcrypt.compare(password, doc.passwordHash as string)
    if (!valid) {
      res.status(401).json({ error: 'Invalid email or password' })
      return
    }
    const token = await signJwt({ employeeId: doc._id.toString(), isAdmin: !!doc.isAdmin })
    setAuthCookie(res, token)
    res.status(200).json({ user: serializeEmployee(doc as never) })
  } catch (err) {
    console.error('[auth login]', err)
    res.status(500).json({ error: err instanceof Error ? err.message : 'Internal server error' })
  }
}

async function handleLogout(res: VercelResponse): Promise<void> {
  clearAuthCookie(res)
  res.status(204).end()
}

async function handleMe(req: VercelRequest, res: VercelResponse): Promise<void> {
  const token = req.cookies?.auth
  if (!token) {
    res.status(401).json({ error: 'Not authenticated' })
    return
  }
  try {
    const payload = await verifyJwt(token)
    const db = await getDb()
    const doc = await db.collection('employees').findOne({ _id: new ObjectId(payload.employeeId) })
    if (!doc) {
      clearAuthCookie(res)
      res.status(401).json({ error: 'User not found' })
      return
    }
    res.status(200).json({ user: serializeEmployee(doc as never) })
  } catch {
    res.status(401).json({ error: 'Invalid or expired session' })
  }
}

async function handleChangePassword(req: VercelRequest, res: VercelResponse): Promise<void> {
  const token = req.cookies?.auth
  if (!token) { res.status(401).json({ error: 'Not authenticated' }); return }
  let employeeId: string
  try {
    employeeId = (await verifyJwt(token)).employeeId
  } catch {
    res.status(401).json({ error: 'Invalid session' }); return
  }
  const parsed = ChangePasswordBodySchema.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0].message }); return
  }
  const { currentPassword, newPassword } = parsed.data
  try {
    const db = await getDb()
    const doc = await db.collection('employees').findOne({ _id: new ObjectId(employeeId) })
    if (!doc) { res.status(404).json({ error: 'User not found' }); return }
    if (!doc.mustChangePassword) {
      if (!currentPassword) { res.status(400).json({ error: 'Current password required' }); return }
      const valid = await bcrypt.compare(currentPassword, doc.passwordHash as string)
      if (!valid) { res.status(401).json({ error: 'Current password is incorrect' }); return }
    }
    const passwordHash = await bcrypt.hash(newPassword, 12)
    await db.collection('employees').updateOne(
      { _id: new ObjectId(employeeId) },
      { $set: { passwordHash, mustChangePassword: false } }
    )
    res.status(200).json({ success: true })
  } catch {
    res.status(500).json({ error: 'Internal server error' })
  }
}

// Admin-only: set or reset email + password for an employee
async function handleSetCredentials(req: VercelRequest, res: VercelResponse): Promise<void> {
  // Verify caller is admin
  const token = req.cookies?.auth
  if (!token) { res.status(401).json({ error: 'Not authenticated' }); return }
  try {
    const caller = await verifyJwt(token)
    if (!caller.isAdmin) {
      res.status(403).json({ error: 'Admin access required' })
      return
    }
  } catch {
    res.status(401).json({ error: 'Invalid session' })
    return
  }

  const parsed = SetCredentialsBodySchema.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0].message })
    return
  }
  const { employeeId, email, password } = parsed.data

  let oid: ObjectId
  try { oid = new ObjectId(employeeId) } catch {
    res.status(400).json({ error: 'Invalid employee ID' }); return
  }

  try {
    const db = await getDb()
    const passwordHash = await bcrypt.hash(password, 12)
    const result = await db.collection('employees').findOneAndUpdate(
      { _id: oid },
      { $set: { email: email.toLowerCase(), passwordHash } },
      { returnDocument: 'after' }
    )
    if (!result) {
      res.status(404).json({ error: 'Employee not found' })
      return
    }
    res.status(200).json({ success: true })
  } catch (err: unknown) {
    // Duplicate email
    if (typeof err === 'object' && err !== null && 'code' in err && err.code === 11000) {
      res.status(409).json({ error: 'Email already in use' })
      return
    }
    res.status(500).json({ error: 'Internal server error' })
  }
}
