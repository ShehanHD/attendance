import { z } from 'zod'
import { ObjectId } from 'mongodb'
import type { VercelRequest, VercelResponse } from '@vercel/node'
import { getDb } from './_db.js'
import { verifyMagicToken, signJwt, setAuthCookie } from './_auth.js'

const BodySchema = z.object({
  token: z.string().min(1),
})

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' })
    return
  }

  const parsed = BodySchema.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ error: 'Missing token' })
    return
  }

  let employeeId: string
  try {
    ;({ employeeId } = await verifyMagicToken(parsed.data.token))
  } catch {
    res.status(401).json({ error: 'Invalid or expired link' })
    return
  }

  let oid: ObjectId
  try { oid = new ObjectId(employeeId) } catch {
    res.status(400).json({ error: 'Invalid token' }); return
  }

  try {
    const db = await getDb()
    const employee = await db.collection('employees').findOne({ _id: oid })
    if (!employee) {
      res.status(401).json({ error: 'Invalid token' })
      return
    }

    const jwt = await signJwt({ employeeId, isAdmin: !!employee.isAdmin })
    setAuthCookie(res, jwt)
    res.status(200).json({ success: true })
  } catch (err) {
    console.error('[webauthn-magic-link-complete]', err)
    res.status(500).json({ error: 'Internal server error' })
  }
}
