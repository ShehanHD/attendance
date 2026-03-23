import { z } from 'zod'
import { ObjectId } from 'mongodb'
import type { VercelRequest, VercelResponse } from '@vercel/node'
import { getDb } from './_db.js'

const PostBodySchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'date must be YYYY-MM-DD'),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'endDate must be YYYY-MM-DD').optional(),
  note: z.string().trim().max(200).nullable(),
})

export default async function handler(
  req: VercelRequest,
  res: VercelResponse
): Promise<void> {
  if (req.method === 'GET') {
    await handleGet(res)
  } else if (req.method === 'POST') {
    await handlePost(req, res)
  } else if (req.method === 'DELETE') {
    await handleDelete(req, res)
  } else {
    res.status(405).json({ error: 'Method not allowed' })
  }
}

async function handleGet(res: VercelResponse): Promise<void> {
  try {
    const db = await getDb()
    const docs = await db.collection('company_closures').find({}).sort({ date: 1 }).toArray()
    const closures = docs.map(({ _id, ...rest }) => ({ ...rest, _id: _id.toString() }))
    res.status(200).json({ closures })
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
  const { date, endDate, note } = parsed.data
  try {
    const db = await getDb()
    const doc = endDate ? { date, endDate, note } : { date, note }
    const result = await db.collection('company_closures').insertOne(doc)
    res.status(201).json({ closure: { _id: result.insertedId.toString(), ...doc } })
  } catch {
    res.status(500).json({ error: 'Internal server error' })
  }
}

async function handleDelete(req: VercelRequest, res: VercelResponse): Promise<void> {
  const id = req.query.id
  if (!id || typeof id !== 'string') {
    res.status(400).json({ error: 'id query param required' })
    return
  }
  let oid: ObjectId
  try {
    oid = new ObjectId(id)
  } catch {
    res.status(400).json({ error: 'Invalid closure ID' })
    return
  }
  try {
    const db = await getDb()
    const result = await db.collection('company_closures').deleteOne({ _id: oid })
    if (result.deletedCount === 0) {
      res.status(404).json({ error: 'Closure not found' })
      return
    }
    res.status(204).end()
  } catch {
    res.status(500).json({ error: 'Internal server error' })
  }
}
