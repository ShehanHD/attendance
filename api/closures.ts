import type { VercelRequest, VercelResponse } from '@vercel/node'
import { getDb } from './_db.js'

export default async function handler(
  req: VercelRequest,
  res: VercelResponse
): Promise<void> {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' })
    return
  }
  try {
    const db = await getDb()
    const docs = await db.collection('company_closures').find({}).toArray()
    const closures = docs.map(({ _id, ...rest }) => ({ ...rest, _id: _id.toString() }))
    res.status(200).json({ closures })
  } catch {
    res.status(500).json({ error: 'Internal server error' })
  }
}
