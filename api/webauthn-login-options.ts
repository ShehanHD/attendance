import { generateAuthenticationOptions } from '@simplewebauthn/server'
import type { VercelRequest, VercelResponse } from '@vercel/node'
import { getDb } from './_db.js'

// No email required — uses discoverable credentials (resident keys).
// The browser shows a native credential picker without needing to specify which credential.
export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' })
    return
  }

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
