import nodemailer from 'nodemailer'
import { ObjectId } from 'mongodb'
import type { VercelRequest, VercelResponse } from '@vercel/node'
import { getDb } from './_db.js'
import { requireAuth, signMagicToken, verifyMagicToken } from './_auth.js'

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (req.method === 'POST') {
    await handleSend(req, res)
  } else if (req.method === 'GET') {
    await handleValidate(req, res)
  } else {
    res.status(405).json({ error: 'Method not allowed' })
  }
}

// POST — send the magic link email to the authenticated user's address
async function handleSend(req: VercelRequest, res: VercelResponse): Promise<void> {
  const auth = await requireAuth(req, res)
  if (!auth) return

  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM, APP_URL } = process.env
  if (!SMTP_HOST || !SMTP_PORT || !SMTP_USER || !SMTP_PASS || !SMTP_FROM || !APP_URL) {
    res.status(500).json({ error: 'SMTP environment variables not configured' })
    return
  }

  try {
    const db = await getDb()

    let oid: ObjectId
    try {
      oid = new ObjectId(auth.employeeId)
    } catch {
      res.status(400).json({ error: 'Invalid employee ID' })
      return
    }

    const employee = await db.collection('employees').findOne({ _id: oid })
    if (!employee) {
      res.status(404).json({ error: 'Employee not found' })
      return
    }
    if (!employee.email) {
      res.status(422).json({ error: 'No email address on file for your account' })
      return
    }

    const token = await signMagicToken(auth.employeeId)
    const link = `${APP_URL}/register-device?token=${encodeURIComponent(token)}`
    const employeeName = typeof employee.name === 'string' ? employee.name : 'there'
    const recipientEmail = employee.email as string

    const html = buildMagicLinkHtml(employeeName, link, APP_URL)
    const text = buildMagicLinkText(employeeName, link)

    const transporter = nodemailer.createTransport({
      host: SMTP_HOST,
      port: Number(SMTP_PORT),
      secure: Number(SMTP_PORT) === 465,
      auth: { user: SMTP_USER, pass: SMTP_PASS },
      connectionTimeout: 10_000,
      greetingTimeout: 10_000,
    })

    await transporter.sendMail({
      from: SMTP_FROM,
      to: recipientEmail,
      subject: 'Register a new device',
      html,
      text,
    })

    res.status(204).end()
  } catch (err) {
    console.error('[webauthn-magic-link send]', err)
    res.status(500).json({ error: 'Failed to send email' })
  }
}

// GET — validate the token and return the employee name (called by the new device)
async function handleValidate(req: VercelRequest, res: VercelResponse): Promise<void> {
  const { token } = req.query
  if (typeof token !== 'string') {
    res.status(400).json({ error: 'Missing or invalid token parameter' })
    return
  }

  let employeeId: string
  try {
    ;({ employeeId } = await verifyMagicToken(token))
  } catch {
    res.status(401).json({ error: 'Invalid or expired link' })
    return
  }

  let oid: ObjectId
  try {
    oid = new ObjectId(employeeId)
  } catch {
    res.status(401).json({ error: 'Invalid token' })
    return
  }

  try {
    const db = await getDb()
    const employee = await db.collection('employees').findOne({ _id: oid })
    if (!employee) {
      res.status(401).json({ error: 'Invalid token' })
      return
    }
    res.status(200).json({ employeeName: employee.name as string })
  } catch (err) {
    console.error('[webauthn-magic-link validate]', err)
    res.status(500).json({ error: 'Internal server error' })
  }
}

// ── Email templates ───────────────────────────────────────────────────────────

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function buildMagicLinkHtml(employeeName: string, link: string, appUrl: string): string {
  const logoUrl = `${appUrl}/logo.png`
  const safeName = escapeHtml(employeeName)
  const safeLink = escapeHtml(link)

  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:sans-serif">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:32px 0">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%">

        <!-- Header -->
        <tr>
          <td style="background:#18181b;border-radius:8px 8px 0 0;padding:24px 32px">
            <img src="${escapeHtml(logoUrl)}" alt="" width="32" height="32"
              style="display:inline-block;vertical-align:middle;margin-right:10px;border-radius:4px"
              onerror="this.style.display='none'">
            <span style="color:#fff;font-size:16px;font-weight:600;vertical-align:middle">Attendance</span>
          </td>
        </tr>

        <!-- Body -->
        <tr>
          <td style="background:#fff;padding:32px;border-radius:0 0 8px 8px">
            <p style="margin:0 0 8px;font-size:18px;font-weight:600;color:#18181b">Register a new device</p>
            <p style="margin:0 0 24px;font-size:14px;color:#52525b">
              Hi ${safeName}, open this link on the new device to register it.
              The link expires in 1 hour.
            </p>

            <!-- CTA button -->
            <table cellpadding="0" cellspacing="0" style="margin:0 0 24px">
              <tr>
                <td style="background:#18181b;border-radius:6px">
                  <a href="${safeLink}"
                    style="display:inline-block;padding:12px 24px;color:#fff;font-size:14px;font-weight:600;text-decoration:none">
                    Register device &rarr;
                  </a>
                </td>
              </tr>
            </table>

            <p style="margin:0 0 24px;font-size:12px;color:#71717a;word-break:break-all">
              Or copy this link: ${safeLink}
            </p>

            <p style="margin:0;font-size:12px;color:#a1a1aa">
              If you didn't request this, you can safely ignore it.
            </p>
          </td>
        </tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`
}

function buildMagicLinkText(employeeName: string, link: string): string {
  return `Hi ${employeeName},

Open this link on your new device to register it.
The link expires in 1 hour.

${link}

If you didn't request this, you can safely ignore it.`
}
