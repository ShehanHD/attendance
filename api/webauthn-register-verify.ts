import { verifyRegistrationResponse } from '@simplewebauthn/server'
import { z } from 'zod'
import type { VercelRequest, VercelResponse } from '@vercel/node'
import { getDb } from './_db.js'
import { requireAuth } from './_auth.js'

const BodySchema = z.object({
  deviceName: z.string().trim().max(100).optional(),
  response: z.unknown(),
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
