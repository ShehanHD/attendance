import { z } from 'zod'
import type { VercelRequest, VercelResponse } from '@vercel/node'
import { getDb } from './_db.js'

const GetQuerySchema = z.object({
  year: z.string().regex(/^\d{4}$/, 'year must be a 4-digit number'),
  month: z.string().regex(/^(?:1[0-2]|[1-9])$/, 'month must be 1–12'),
  employeeId: z.string().optional(),
})

const PostBodySchema = z.object({
  employeeId: z.string().min(1),
  year: z.number().int().min(2000).max(2100),
  month: z.number().int().min(1).max(12),
  entries: z.array(z.record(z.string(), z.unknown())),
})

export default async function handler(
  req: VercelRequest,
  res: VercelResponse
): Promise<void> {
  if (req.method === 'GET') {
    await handleGet(req, res)
  } else if (req.method === 'POST') {
    await handlePost(req, res)
  } else {
    res.status(405).json({ error: 'Method not allowed' })
  }
}

async function handleGet(req: VercelRequest, res: VercelResponse): Promise<void> {
  const parsed = GetQuerySchema.safeParse(req.query)
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0].message })
    return
  }

  const { employeeId, year, month } = parsed.data
  const prefix = `${year}-${month.padStart(2, '0')}`
  const filter: Record<string, unknown> = { date: { $regex: `^${prefix}` } }
  if (employeeId) filter['employeeId'] = employeeId

  try {
    const db = await getDb()
    const docs = await db.collection('attendance_entries').find(filter).toArray()
    const entries = docs.map(({ _id, ...rest }) => ({ ...rest, _id: _id.toString() }))
    res.status(200).json({ entries })
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

  const { employeeId, year, month, entries } = parsed.data
  const prefix = `${year}-${String(month).padStart(2, '0')}`

  try {
    const db = await getDb()
    const col = db.collection('attendance_entries')

    await col.deleteMany({ employeeId, date: { $regex: `^${prefix}` } })

    if (entries.length > 0) {
      // Strip client-side _id — MongoDB assigns real ObjectIds
      const docs = entries.map(({ _id: _, ...rest }) => rest)
      await col.insertMany(docs)
    }

    res.status(204).end()
  } catch {
    res.status(500).json({ error: 'Internal server error' })
  }
}
