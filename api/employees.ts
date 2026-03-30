import { z } from 'zod'
import bcrypt from 'bcryptjs'
import { ObjectId } from 'mongodb'
import type { VercelRequest, VercelResponse } from '@vercel/node'
import { getDb } from './_db.js'
import { requireAuth } from './_auth.js'

const PostBodySchema = z.object({
  name: z.string().min(1),
  standardHours: z.number().int().positive(),
  isAdmin: z.boolean(),
  hasTickets: z.boolean().default(true),
  email: z.string().email().optional(),
  password: z.string().min(8).optional(),
})

const PutBodySchema = z.object({
  _id: z.string().min(1),
  name: z.string().min(1),
  standardHours: z.number().int().positive(),
  isAdmin: z.boolean(),
  isActive: z.boolean(),
  hasTickets: z.boolean().default(true),
})

export default async function handler(
  req: VercelRequest,
  res: VercelResponse
): Promise<void> {
  const auth = await requireAuth(req, res)
  if (!auth) return

  if (req.method === 'GET') {
    await handleGet(res)
  } else if (req.method === 'POST') {
    if (!auth.isAdmin) { res.status(403).json({ error: 'Admin access required' }); return }
    await handlePost(req, res)
  } else if (req.method === 'PUT') {
    if (!auth.isAdmin) { res.status(403).json({ error: 'Admin access required' }); return }
    await handlePut(req, res)
  } else {
    res.status(405).json({ error: 'Method not allowed' })
  }
}

async function handleGet(res: VercelResponse): Promise<void> {
  try {
    const db = await getDb()
    const docs = await db.collection('employees').find({}).toArray()
    const employees = docs.map(({ _id, ...rest }) => ({ ...rest, _id: _id.toString() }))
    res.status(200).json({ employees })
  } catch {
    res.status(500).json({ error: 'Internal server error' })
  }
}

async function handlePost(req: VercelRequest, res: VercelResponse): Promise<void> {
  const parsed = PostBodySchema.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0].message })
    return
  }
  const { name, standardHours, isAdmin, hasTickets, email, password } = parsed.data
  if (email && !password) {
    res.status(400).json({ error: 'Password is required when email is provided' })
    return
  }
  try {
    const db = await getDb()
    const today = new Date().toISOString().slice(0, 10)
    const doc: Record<string, unknown> = { name, standardHours, isAdmin, isActive: true, hasTickets, createdAt: today }
    if (email && password) {
      doc.email = email.toLowerCase()
      doc.passwordHash = await bcrypt.hash(password, 12)
      doc.mustChangePassword = true
    }
    const result = await db.collection('employees').insertOne(doc)
    const { passwordHash: _ph, mustChangePassword: _mcp, ...safeDoc } = doc
    const employee = { _id: result.insertedId.toString(), ...safeDoc }
    res.status(201).json({ employee })
  } catch (err: unknown) {
    if (typeof err === 'object' && err !== null && 'code' in err && err.code === 11000) {
      res.status(409).json({ error: 'Email already in use' })
      return
    }
    res.status(500).json({ error: 'Internal server error' })
  }
}

async function handlePut(req: VercelRequest, res: VercelResponse): Promise<void> {
  const parsed = PutBodySchema.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0].message })
    return
  }
  const { _id, ...fields } = parsed.data
  let oid: ObjectId
  try {
    oid = new ObjectId(_id)
  } catch {
    res.status(400).json({ error: 'Invalid employee ID' })
    return
  }
  try {
    const db = await getDb()
    const current = await db.collection('employees').findOne({ _id: oid })
    if (!current) {
      res.status(404).json({ error: 'Employee not found' })
      return
    }
    const today = new Date().toISOString().slice(0, 10)
    const updateFields: Record<string, unknown> = { ...fields }
    const wasActive = current.isActive !== false
    if (wasActive && fields.isActive === false) {
      updateFields.deactivatedAt = today
    } else if (!wasActive && fields.isActive === true) {
      updateFields.deactivatedAt = null
    }
    const result = await db
      .collection('employees')
      .findOneAndUpdate({ _id: oid }, { $set: updateFields }, { returnDocument: 'after' })
    const { _id: docId, ...rest } = result as { _id: { toString(): string }; [key: string]: unknown }
    res.status(200).json({ employee: { _id: docId.toString(), ...rest } })
  } catch {
    res.status(500).json({ error: 'Internal server error' })
  }
}
