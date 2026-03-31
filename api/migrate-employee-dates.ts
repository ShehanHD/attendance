import type { VercelRequest, VercelResponse } from '@vercel/node'
import { getDb } from './_db.js'
import { requireAuth } from './_auth.js'

/**
 * One-time migration: sets createdAt='2026-01-01' for all employees that don't have it yet.
 * Call POST /api/migrate-employee-dates once as an admin, then this endpoint can be removed.
 */
export default async function handler(
  req: VercelRequest,
  res: VercelResponse
): Promise<void> {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' })
    return
  }

  const auth = await requireAuth(req, res)
  if (!auth) return
  if (!auth.isAdmin) {
    res.status(403).json({ error: 'Admin access required' })
    return
  }

  try {
    const db = await getDb()
    const result = await db.collection('employees').updateMany(
      { createdAt: { $exists: false } },
      { $set: { createdAt: '2026-01-01' } }
    )
    res.status(200).json({ updated: result.modifiedCount })
  } catch {
    res.status(500).json({ error: 'Internal server error' })
  }
}
