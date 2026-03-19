import type { VercelRequest, VercelResponse } from '@vercel/node'
import { getDb } from './_db.js'

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
  const { employeeId, year, month } = req.query as Record<string, string | undefined>

  if (!year || !month) {
    res.status(400).json({ error: 'year and month query params are required' })
    return
  }

  const prefix = `${year}-${String(month).padStart(2, '0')}`
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
  const { employeeId, year, month, entries } = req.body as {
    employeeId?: string
    year?: number
    month?: number
    entries?: Array<Record<string, unknown>>
  }

  if (!employeeId || year == null || month == null || !Array.isArray(entries)) {
    res.status(400).json({ error: 'employeeId, year, month, and entries are required' })
    return
  }

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
