import { type AuthenticatorTransport, generateRegistrationOptions, verifyRegistrationResponse } from '@simplewebauthn/server'
import { z } from 'zod'
import { ObjectId } from 'mongodb'
import type { VercelRequest, VercelResponse } from '@vercel/node'
import { getDb } from './_db.js'
import { resolveAuth } from './_auth.js'

// GET  — generate registration options (start registration ceremony)
// POST — verify registration response  (complete registration ceremony)

const VerifyBodySchema = z.object({
  deviceName: z.string().trim().max(100).optional(),
  response: z.unknown(),
})

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (req.method === 'GET') {
    await handleOptions(req, res)
  } else if (req.method === 'POST') {
    await handleVerify(req, res)
  } else {
    res.status(405).json({ error: 'Method not allowed' })
  }
}

async function handleOptions(req: VercelRequest, res: VercelResponse): Promise<void> {
  const auth = await resolveAuth(req, res)
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

async function handleVerify(req: VercelRequest, res: VercelResponse): Promise<void> {
  const auth = await resolveAuth(req, res)
  if (!auth) return

  const parsed = VerifyBodySchema.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0].message })
    return
  }
  const { deviceName, response } = parsed.data

  try {
    const db = await getDb()
    const challengeDoc = await db.collection('webauthn_challenges').findOneAndDelete({
      employeeId: auth.employeeId,
    })
    if (!challengeDoc) {
      res.status(400).json({ error: 'No pending challenge. Please restart registration.' })
      return
    }

    const verification = await verifyRegistrationResponse({
      response: response as Parameters<typeof verifyRegistrationResponse>[0]['response'],
      expectedChallenge: challengeDoc.challenge as string,
      expectedOrigin: process.env.WEBAUTHN_ORIGIN ?? 'http://localhost:5173',
      expectedRPID: process.env.WEBAUTHN_RP_ID ?? 'localhost',
    })

    if (!verification.verified || !verification.registrationInfo) {
      res.status(400).json({ error: 'Verification failed' })
      return
    }

    const { credential } = verification.registrationInfo

    await db.collection('webauthn_credentials').insertOne({
      employeeId: auth.employeeId,
      credentialId: credential.id,
      publicKey: Buffer.from(credential.publicKey).toString('base64url'),
      counter: credential.counter,
      transports: credential.transports ?? [],
      deviceName: deviceName ?? 'Unknown device',
      createdAt: new Date(),
    })

    res.status(201).json({ success: true })
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Internal server error' })
  }
}
