import { type AuthenticatorTransport, generateAuthenticationOptions, verifyAuthenticationResponse } from '@simplewebauthn/server'
import { ObjectId } from 'mongodb'
import { z } from 'zod'
import type { VercelRequest, VercelResponse } from '@vercel/node'
import { getDb } from './_db.js'
import { signJwt, setAuthCookie } from './_auth.js'

// GET  — generate authentication options (start login ceremony)
// POST — verify authentication response  (complete login ceremony)

// No email required — uses discoverable credentials (resident keys).
// The browser shows a native credential picker without needing to specify which credential.

const VerifyBodySchema = z.object({
  challengeId: z.string().min(1),
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

async function handleOptions(_req: VercelRequest, res: VercelResponse): Promise<void> {
  try {
    const db = await getDb()

    const options = await generateAuthenticationOptions({
      rpID: process.env.WEBAUTHN_RP_ID ?? 'localhost',
      userVerification: 'preferred',
      // No allowCredentials → discoverable: browser presents all registered passkeys for this RP
    })

    // Store challenge keyed by its own value — verified and deleted on verify
    const result = await db.collection('webauthn_challenges').insertOne({
      challenge: options.challenge,
      createdAt: new Date(),
    })

    // Return challengeId so the verify endpoint can look it up
    res.status(200).json({ options, challengeId: result.insertedId.toString() })
  } catch {
    res.status(500).json({ error: 'Internal server error' })
  }
}

async function handleVerify(req: VercelRequest, res: VercelResponse): Promise<void> {
  const parsed = VerifyBodySchema.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0].message })
    return
  }
  const { challengeId, response } = parsed.data

  try {
    const db = await getDb()

    let challengeOid: ObjectId
    try { challengeOid = new ObjectId(challengeId) } catch {
      res.status(400).json({ error: 'Invalid challengeId' }); return
    }

    const challengeDoc = await db.collection('webauthn_challenges').findOneAndDelete({
      _id: challengeOid,
    })
    if (!challengeDoc) {
      res.status(400).json({ error: 'Challenge not found or expired. Please try again.' })
      return
    }

    // Extract employeeId from userHandle (set during registration as TextEncoder(employeeId))
    const authResponse = response as { response?: { userHandle?: string }; id: string }
    const userHandle = authResponse.response?.userHandle
    if (!userHandle) {
      res.status(401).json({ error: 'No user handle in response. Re-register your biometric.' })
      return
    }
    const employeeId = Buffer.from(userHandle, 'base64url').toString('utf8')

    const employee = await db.collection('employees').findOne({ _id: new ObjectId(employeeId) })
    if (!employee) {
      res.status(401).json({ error: 'Authentication failed' })
      return
    }

    const credential = await db.collection('webauthn_credentials').findOne({
      employeeId,
      credentialId: authResponse.id,
    })
    if (!credential) {
      res.status(401).json({ error: 'Credential not found' })
      return
    }

    const verification = await verifyAuthenticationResponse({
      response: response as Parameters<typeof verifyAuthenticationResponse>[0]['response'],
      expectedChallenge: challengeDoc.challenge as string,
      expectedOrigin: process.env.WEBAUTHN_ORIGIN ?? 'http://localhost:3000',
      expectedRPID: process.env.WEBAUTHN_RP_ID ?? 'localhost',
      credential: {
        id: credential.credentialId as string,
        publicKey: Buffer.from(credential.publicKey as string, 'base64url'),
        counter: credential.counter as number,
        transports: (credential.transports ?? []) as AuthenticatorTransport[],
      },
    })

    if (!verification.verified) {
      res.status(401).json({ error: 'Authentication failed' })
      return
    }

    await db.collection('webauthn_credentials').updateOne(
      { _id: credential._id },
      { $set: { counter: verification.authenticationInfo.newCounter } }
    )

    const token = await signJwt({ employeeId, isAdmin: !!employee.isAdmin })
    setAuthCookie(res, token)

    res.status(200).json({
      user: {
        _id: employee._id.toString(),
        name: employee.name,
        email: employee.email ?? null,
        isAdmin: !!employee.isAdmin,
        isActive: !!employee.isActive,
        standardHours: employee.standardHours,
        hasTickets: !!employee.hasTickets,
        mustChangePassword: !!employee.mustChangePassword,
      },
    })
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Internal server error' })
  }
}
