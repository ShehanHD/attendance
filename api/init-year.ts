import type { VercelRequest, VercelResponse } from '@vercel/node'
import { z } from 'zod'
import { ObjectId } from 'mongodb'
import { getDb } from './_db.js'
import { requireAuth } from './_auth.js'

const EntrySchema = z.object({
  // _id from client is a temp UUID — ignored; server assigns ObjectId
  employeeId: z.string(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  type: z.enum(['present', 'absent', 'vacation', 'sick']),
  hours: z.number().min(0).max(24),
  sickRef: z.string().nullable(),
})

const BodySchema = z.object({
  employeeId: z.string(),
  year: z.number().int().min(2000).max(2100),
  months: z.array(z.object({
    month: z.number().int().min(1).max(12),
    entries: z.array(EntrySchema.extend({ _id: z.string() })),
  })),
})

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' })
    return
  }

  const auth = await requireAuth(req, res)
  if (!auth) return

  const parsed = BodySchema.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0].message })
    return
  }
  const { employeeId, year, months } = parsed.data

  if (!auth.isAdmin && auth.employeeId !== employeeId) {
    res.status(403).json({ error: 'Forbidden' })
    return
  }

  const db = await getDb()
  const initialized: number[] = []

  for (const { month, entries } of months) {
    if (entries.length === 0) continue

    const prefix = `${year}-${String(month).padStart(2, '0')}-`
    const existing = await db.collection('entries').countDocuments({
      employeeId,
      date: { $regex: `^${prefix}` },
    })
    if (existing > 0) continue

    // Strip client _id, assign server ObjectId
    const docs = entries.map(({ _id: _ignored, ...rest }) => ({
      _id: new ObjectId(),
      ...rest,
    }))
    await db.collection('entries').insertMany(docs)
    initialized.push(month)
  }

  res.status(200).json({ initialized })
}
