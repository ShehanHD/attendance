import { z } from 'zod'
import { ObjectId } from 'mongodb'
import type { VercelRequest, VercelResponse } from '@vercel/node'
import { getDb } from './_db.js'

const PostBodySchema = z.object({
  name: z.string().min(1),
  standardHours: z.number().int().positive(),
  isAdmin: z.boolean(),
})

const PutBodySchema = z.object({
  _id: z.string().min(1),
  name: z.string().min(1),
  standardHours: z.number().int().positive(),
  isAdmin: z.boolean(),
  isActive: z.boolean(),
})

export default async function handler(
  req: VercelRequest,
  res: VercelResponse
): Promise<void> {
  if (req.method === 'GET') {
    await handleGet(res)
  } else if (req.method === 'POST') {
    await handlePost(req, res)
  } else if (req.method === 'PUT') {
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
  const { name, standardHours, isAdmin } = parsed.data
  try {
    const db = await getDb()
    const result = await db
      .collection('employees')
      .insertOne({ name, standardHours, isAdmin, isActive: true })
    const employee = {
      _id: result.insertedId.toString(),
      name,
      standardHours,
      isAdmin,
      isActive: true,
    }
    res.status(201).json({ employee })
  } catch {
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
    const result = await db
      .collection('employees')
      .findOneAndUpdate({ _id: oid }, { $set: fields }, { returnDocument: 'after' })
    if (!result) {
      res.status(404).json({ error: 'Employee not found' })
      return
    }
    const { _id: docId, ...rest } = result as { _id: { toString(): string }; [key: string]: unknown }
    res.status(200).json({ employee: { _id: docId.toString(), ...rest } })
  } catch {
    res.status(500).json({ error: 'Internal server error' })
  }
}
