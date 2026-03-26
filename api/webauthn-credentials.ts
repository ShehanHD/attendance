import type { VercelRequest, VercelResponse } from '@vercel/node'
import { ObjectId } from 'mongodb'
import { getDb } from './_db.js'
import { requireAuth } from './_auth.js'

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  const auth = await requireAuth(req, res)
  if (!auth) return

  const db = await getDb()

  // GET — list registered devices for the authenticated employee
  if (req.method === 'GET') {
    const docs = await db
      .collection('webauthn_credentials')
      .find({ employeeId: auth.employeeId }, { projection: { credentialId: 0, publicKey: 0, counter: 0 } })
      .sort({ createdAt: 1 })
      .toArray()

    const devices = docs.map(d => ({
      _id: d._id.toString(),
      deviceName: d.deviceName as string,
      createdAt: (d.createdAt as Date).toISOString(),
    }))

    res.status(200).json({ devices })
    return
  }

  // DELETE — remove a credential by its document _id
  if (req.method === 'DELETE') {
    const id = typeof req.query.id === 'string' ? req.query.id : null
    if (!id || !ObjectId.isValid(id)) {
      res.status(400).json({ error: 'Missing or invalid id' })
      return
    }

    const result = await db.collection('webauthn_credentials').deleteOne({
      _id: new ObjectId(id),
      employeeId: auth.employeeId, // ensure ownership — can't delete another user's credential
    })

    if (result.deletedCount === 0) {
      res.status(404).json({ error: 'Credential not found' })
      return
    }

    res.status(204).end()
    return
  }

  res.status(405).json({ error: 'Method not allowed' })
}
