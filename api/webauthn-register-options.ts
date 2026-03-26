import {type AuthenticatorTransport, generateRegistrationOptions} from '@simplewebauthn/server'
import { ObjectId } from 'mongodb'
import type { VercelRequest, VercelResponse } from '@vercel/node'
import { getDb } from './_db.js'
import { requireAuth } from './_auth.js'

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' })
    return
  }

  const auth = await requireAuth(req, res)
  if (!auth) return

  try {
    const db = await getDb()
    const employee = await db.collection('employees').findOne({ _id: new ObjectId(auth.employeeId) })
    if (!employee) {
      res.status(404).json({ error: 'Employee not found' })
      return
    }

    const existing = await db
      .collection('webauthn_credentials')
      .find({ employeeId: auth.employeeId })
      .toArray()

    const options = await generateRegistrationOptions({
      rpName: process.env.WEBAUTHN_RP_NAME ?? 'Attendance',
      rpID: process.env.WEBAUTHN_RP_ID ?? 'localhost',
      userID: new TextEncoder().encode(auth.employeeId),
      userName: (employee.email as string) ?? auth.employeeId,
      userDisplayName: employee.name as string,
      excludeCredentials: existing.map(c => ({
        id: c.credentialId as string,
        transports: (c.transports ?? []) as AuthenticatorTransport[],
      })),
      authenticatorSelection: {
        residentKey: 'preferred',
        userVerification: 'preferred',
      },
    })

    // Store challenge (overwrite any existing pending challenge for this user)
    await db.collection('webauthn_challenges').deleteMany({ employeeId: auth.employeeId })
    await db.collection('webauthn_challenges').insertOne({
      employeeId: auth.employeeId,
      challenge: options.challenge,
      createdAt: new Date(),
    })

    res.status(200).json(options)
  } catch {
    res.status(500).json({ error: 'Internal server error' })
  }
}
