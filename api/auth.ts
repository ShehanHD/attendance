import { z } from 'zod'
import bcrypt from 'bcryptjs'
import { ObjectId } from 'mongodb'
import nodemailer from 'nodemailer'
import type { VercelRequest, VercelResponse } from '@vercel/node'
import { getDb } from './_db.js'
import { signJwt, verifyJwt, setAuthCookie, clearAuthCookie } from './_auth.js'

const LoginBodySchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
})

const SetCredentialsBodySchema = z.object({
  employeeId: z.string().min(1),
  email: z.string().email(),
})

const ChangePasswordBodySchema = z.object({
  currentPassword: z.string().optional(),
  newPassword: z.string().min(8, 'Password must be at least 8 characters'),
})

function serializeEmployee(doc: Record<string, unknown> & { _id: { toString(): string } }) {
  return {
    _id: doc._id.toString(),
    name: doc.name,
    email: doc.email ?? null,
    isAdmin: !!doc.isAdmin,
    isActive: !!doc.isActive,
    standardHours: doc.standardHours,
    hasTickets: !!doc.hasTickets,
    mustChangePassword: !!doc.mustChangePassword,
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (req.method === 'POST') {
    await handleLogin(req, res)
  } else if (req.method === 'DELETE') {
    await handleLogout(res)
  } else if (req.method === 'GET') {
    await handleMe(req, res)
  } else if (req.method === 'PUT') {
    await handleSetCredentials(req, res)
  } else if (req.method === 'PATCH') {
    await handleChangePassword(req, res)
  } else {
    res.status(405).json({ error: 'Method not allowed' })
  }
}

async function handleLogin(req: VercelRequest, res: VercelResponse): Promise<void> {
  const parsed = LoginBodySchema.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0].message })
    return
  }
  const { email, password } = parsed.data
  try {
    const db = await getDb()
    const doc = await db.collection('employees').findOne({ email: email.toLowerCase() })
    if (!doc || !doc.passwordHash) {
      res.status(401).json({ error: 'Invalid email or password' })
      return
    }
    const valid = await bcrypt.compare(password, doc.passwordHash as string)
    if (!valid) {
      res.status(401).json({ error: 'Invalid email or password' })
      return
    }
    const token = await signJwt({ employeeId: doc._id.toString(), isAdmin: !!doc.isAdmin })
    setAuthCookie(res, token)
    res.status(200).json({ user: serializeEmployee(doc as never) })
  } catch (err) {
    console.error('[auth login]', err)
    res.status(500).json({ error: err instanceof Error ? err.message : 'Internal server error' })
  }
}

async function handleLogout(res: VercelResponse): Promise<void> {
  clearAuthCookie(res)
  res.status(204).end()
}

async function handleMe(req: VercelRequest, res: VercelResponse): Promise<void> {
  const token = req.cookies?.auth
  if (!token) {
    res.status(401).json({ error: 'Not authenticated' })
    return
  }
  try {
    const payload = await verifyJwt(token)
    const db = await getDb()
    const doc = await db.collection('employees').findOne({ _id: new ObjectId(payload.employeeId) })
    if (!doc) {
      clearAuthCookie(res)
      res.status(401).json({ error: 'User not found' })
      return
    }
    res.status(200).json({ user: serializeEmployee(doc as never) })
  } catch {
    res.status(401).json({ error: 'Invalid or expired session' })
  }
}

async function handleChangePassword(req: VercelRequest, res: VercelResponse): Promise<void> {
  const token = req.cookies?.auth
  if (!token) { res.status(401).json({ error: 'Not authenticated' }); return }
  let employeeId: string
  try {
    employeeId = (await verifyJwt(token)).employeeId
  } catch {
    res.status(401).json({ error: 'Invalid session' }); return
  }
  const parsed = ChangePasswordBodySchema.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0].message }); return
  }
  const { currentPassword, newPassword } = parsed.data
  try {
    const db = await getDb()
    const doc = await db.collection('employees').findOne({ _id: new ObjectId(employeeId) })
    if (!doc) { res.status(404).json({ error: 'User not found' }); return }
    if (!doc.mustChangePassword) {
      if (!currentPassword) { res.status(400).json({ error: 'Current password required' }); return }
      const valid = await bcrypt.compare(currentPassword, doc.passwordHash as string)
      if (!valid) { res.status(401).json({ error: 'Current password is incorrect' }); return }
    }
    const passwordHash = await bcrypt.hash(newPassword, 12)
    await db.collection('employees').updateOne(
      { _id: new ObjectId(employeeId) },
      { $set: { passwordHash, mustChangePassword: false } }
    )
    res.status(200).json({ success: true })
  } catch {
    res.status(500).json({ error: 'Internal server error' })
  }
}

// Admin-only: set or reset email + password for an employee
async function handleSetCredentials(req: VercelRequest, res: VercelResponse): Promise<void> {
  // Verify caller is admin
  const token = req.cookies?.auth
  if (!token) { res.status(401).json({ error: 'Not authenticated' }); return }
  try {
    const caller = await verifyJwt(token)
    if (!caller.isAdmin) {
      res.status(403).json({ error: 'Admin access required' })
      return
    }
  } catch {
    res.status(401).json({ error: 'Invalid session' })
    return
  }

  const parsed = SetCredentialsBodySchema.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0].message })
    return
  }
  const { employeeId, email } = parsed.data

  let oid: ObjectId
  try { oid = new ObjectId(employeeId) } catch {
    res.status(400).json({ error: 'Invalid employee ID' }); return
  }

  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM, APP_URL } = process.env
  if (!SMTP_HOST || !SMTP_PORT || !SMTP_USER || !SMTP_PASS || !SMTP_FROM) {
    res.status(500).json({ error: 'SMTP environment variables not configured' })
    return
  }
  const appUrl = APP_URL ?? ''

  // Generate a temporary password server-side
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789'
  const bytes = Array.from({ length: 12 }, () => Math.floor(Math.random() * chars.length))
  const tempPassword = bytes.map(i => chars[i]).join('')

  try {
    const db = await getDb()
    const passwordHash = await bcrypt.hash(tempPassword, 12)
    const result = await db.collection('employees').findOneAndUpdate(
      { _id: oid },
      { $set: { email: email.toLowerCase(), passwordHash, mustChangePassword: true } },
      { returnDocument: 'after' }
    )
    if (!result) {
      res.status(404).json({ error: 'Employee not found' })
      return
    }

    const employeeName = (result.name as string | undefined) ?? 'there'
    const transporter = nodemailer.createTransport({
      host: SMTP_HOST,
      port: Number(SMTP_PORT),
      secure: Number(SMTP_PORT) === 465,
      auth: { user: SMTP_USER, pass: SMTP_PASS },
    })
    const htmlBody = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:40px 16px;">
    <tr><td align="center">
      <table width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 1px 4px rgba(0,0,0,0.08);">

        <!-- Header -->
        <tr>
          <td style="background:#18181b;padding:24px 40px;">
            ${appUrl
              ? `<img src="${appUrl}/LOGO-VCS-variante_colore2.png" alt="VCS" height="36" style="display:block;height:36px;width:auto;border:0;">`
              : `<p style="margin:0;font-size:18px;font-weight:600;color:#ffffff;letter-spacing:-0.3px;">VCS</p>`}
          </td>
        </tr>

        <!-- Body -->
        <tr>
          <td style="padding:36px 40px;">
            <p style="margin:0 0 6px;font-size:22px;font-weight:600;color:#18181b;letter-spacing:-0.4px;">Welcome, ${employeeName}</p>
            <p style="margin:0 0 28px;font-size:15px;color:#71717a;line-height:1.6;">Your login has been set up. Use the credentials below to sign in for the first time.</p>

            <!-- Credentials box -->
            <table width="100%" cellpadding="0" cellspacing="0" style="background:#f9f9f9;border:1px solid #e4e4e7;border-radius:8px;margin-bottom:28px;">
              <tr>
                <td style="padding:20px 24px;">
                  <p style="margin:0 0 12px;font-size:12px;font-weight:600;color:#a1a1aa;text-transform:uppercase;letter-spacing:0.6px;">Your credentials</p>
                  <table cellpadding="0" cellspacing="0">
                    <tr>
                      <td style="font-size:13px;color:#71717a;padding-bottom:6px;width:80px;">Email</td>
                      <td style="font-size:13px;font-weight:500;color:#18181b;padding-bottom:6px;">${email}</td>
                    </tr>
                    <tr>
                      <td style="font-size:13px;color:#71717a;">Password</td>
                      <td style="font-size:14px;font-weight:600;color:#18181b;font-family:'Courier New',monospace;letter-spacing:1px;">${tempPassword}</td>
                    </tr>
                  </table>
                </td>
              </tr>
            </table>

            <p style="margin:0 0 24px;font-size:13px;color:#71717a;line-height:1.6;">You will be prompted to set a new password after your first login.</p>

            ${appUrl ? `<!-- CTA button -->
            <table cellpadding="0" cellspacing="0">
              <tr>
                <td style="border-radius:8px;background:#18181b;">
                  <a href="${appUrl}" target="_blank" style="display:inline-block;padding:12px 28px;font-size:14px;font-weight:600;color:#ffffff;text-decoration:none;letter-spacing:-0.1px;">Open app →</a>
                </td>
              </tr>
            </table>` : ''}
          </td>
        </tr>

        <!-- Footer -->
        <tr>
          <td style="padding:20px 40px;border-top:1px solid #f4f4f5;">
            <p style="margin:0;font-size:12px;color:#a1a1aa;line-height:1.6;">If you didn't expect this email, you can safely ignore it.</p>
          </td>
        </tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`

    const textBody = `Hi ${employeeName},\n\nYour login has been set up.\n\nEmail: ${email}\nTemporary password: ${tempPassword}\n\nYou will be prompted to set a new password after your first login.${appUrl ? `\n\nOpen the app: ${appUrl}` : ''}\n\nIf you didn't expect this email, you can safely ignore it.`

    await transporter.sendMail({
      from: SMTP_FROM,
      to: email,
      subject: 'Your login credentials',
      text: textBody,
      html: htmlBody,
    })

    res.status(200).json({ success: true })
  } catch (err: unknown) {
    // Duplicate email
    if (typeof err === 'object' && err !== null && 'code' in err && err.code === 11000) {
      res.status(409).json({ error: 'Email already in use' })
      return
    }
    console.error('[auth set-credentials]', err)
    res.status(500).json({ error: 'Internal server error' })
  }
}
