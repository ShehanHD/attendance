# Magic Link Device Registration — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow a logged-in user to send themselves a magic link by email that registers a new WebAuthn device on any device without requiring a password.

**Architecture:** A signed JWT (`purpose: "device-registration"`, 1h expiry) is generated server-side using the existing `JWT_SECRET`. The link opens `/register-device?token=<jwt>`, which validates the token, runs the full WebAuthn registration flow (passing the token as `X-Magic-Token` header instead of a cookie), then issues a normal auth cookie so the user is automatically logged in.

**Tech Stack:** TypeScript, `jose` (already installed), `@simplewebauthn/server` + `@simplewebauthn/browser` (already installed), `nodemailer` (already installed), MongoDB, React 19, React Router, Zod, shadcn/ui, Vercel serverless functions.

---

## File Map

| File | Change |
|------|--------|
| `api/_auth.ts` | Add `signMagicToken`, `verifyMagicToken`, `resolveAuth` |
| `api/webauthn-magic-link.ts` | **New** — POST (send link) + GET (validate token) |
| `api/webauthn-magic-link-complete.ts` | **New** — POST (issue auth cookie) |
| `api/webauthn-register-options.ts` | Replace `requireAuth` with `resolveAuth` |
| `api/webauthn-register-verify.ts` | Replace `requireAuth` with `resolveAuth` |
| `src/lib/mongoApi.ts` | Add 3 wrappers, extend 2 existing functions |
| `src/pages/RegisterDevice.tsx` | **New** — page component |
| `src/App.tsx` | Add `/register-device` route |
| `src/components/ProfileModal.tsx` | Add "Send registration link" button |

> `vercel.json` — **no change needed**. The existing catch-all rewrite already routes `/register-device` to the SPA.

---

## Task 1: Add magic token helpers to `api/_auth.ts`

**Files:**
- Modify: `api/_auth.ts`

- [ ] **Step 1: Add the three new exports to `api/_auth.ts`**

  Append the following at the bottom of `api/_auth.ts` (after the `requireAuth` function):

  ```typescript
  export async function signMagicToken(employeeId: string): Promise<string> {
    return new SignJWT({ purpose: 'device-registration' })
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject(employeeId)
      .setIssuedAt()
      .setExpirationTime('1h')
      .sign(getSecret())
  }

  export async function verifyMagicToken(token: string): Promise<{ employeeId: string }> {
    const { payload } = await jwtVerify(token, getSecret())
    if (payload.purpose !== 'device-registration' || typeof payload.sub !== 'string') {
      throw new Error('Invalid magic token')
    }
    return { employeeId: payload.sub }
  }

  // Resolves the caller's employeeId from either an auth cookie OR an X-Magic-Token header.
  // Cookie takes precedence. Sends 401 and returns null if neither is valid.
  export async function resolveAuth(
    req: VercelRequest,
    res: VercelResponse
  ): Promise<{ employeeId: string; isAdmin: boolean } | null> {
    const cookieToken = req.cookies?.[COOKIE_NAME]
    if (cookieToken) {
      try {
        return await verifyJwt(cookieToken)
      } catch {
        res.status(401).json({ error: 'Invalid or expired session' })
        return null
      }
    }
    const magicToken = req.headers['x-magic-token']
    if (typeof magicToken === 'string') {
      try {
        const { employeeId } = await verifyMagicToken(magicToken)
        return { employeeId, isAdmin: false }
      } catch {
        res.status(401).json({ error: 'Invalid or expired magic token' })
        return null
      }
    }
    res.status(401).json({ error: 'Not authenticated' })
    return null
  }
  ```

- [ ] **Step 2: Verify the build compiles**

  Run: `npx tsc --noEmit`
  Expected: no errors

- [ ] **Step 3: Commit**

  ```bash
  git add api/_auth.ts
  git commit -m "feat: add signMagicToken, verifyMagicToken, resolveAuth to _auth"
  ```

---

## Task 2: Create `api/webauthn-magic-link.ts`

**Files:**
- Create: `api/webauthn-magic-link.ts`

- [ ] **Step 1: Create the file**

  ```typescript
  import nodemailer from 'nodemailer'
  import { ObjectId } from 'mongodb'
  import type { VercelRequest, VercelResponse } from '@vercel/node'
  import { getDb } from './_db.js'
  import { requireAuth, signMagicToken, verifyMagicToken } from './_auth.js'

  export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
    if (req.method === 'POST') {
      await handleSendLink(req, res)
    } else if (req.method === 'GET') {
      await handleValidateToken(req, res)
    } else {
      res.status(405).json({ error: 'Method not allowed' })
    }
  }

  async function handleSendLink(req: VercelRequest, res: VercelResponse): Promise<void> {
    const auth = await requireAuth(req, res)
    if (!auth) return

    const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM, APP_URL } = process.env
    if (!SMTP_HOST || !SMTP_PORT || !SMTP_USER || !SMTP_PASS || !SMTP_FROM) {
      res.status(500).json({ error: 'SMTP not configured' })
      return
    }

    try {
      const db = await getDb()
      const employee = await db.collection('employees').findOne({ _id: new ObjectId(auth.employeeId) })
      if (!employee) {
        res.status(404).json({ error: 'Employee not found' })
        return
      }
      if (!employee.email) {
        res.status(422).json({ error: 'No email address on file for your account' })
        return
      }

      const token = await signMagicToken(auth.employeeId)
      const appUrl = APP_URL ?? ''
      const link = `${appUrl}/register-device?token=${encodeURIComponent(token)}`
      const employeeName = (employee.name as string) ?? 'there'
      const email = employee.email as string

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
          <tr>
            <td style="background:#18181b;padding:24px 40px;">
              ${appUrl
                ? `<img src="${appUrl}/LOGO-VCS-variante_colore2.png" alt="VCS" height="36" style="display:block;height:36px;width:auto;border:0;">`
                : `<p style="margin:0;font-size:18px;font-weight:600;color:#ffffff;letter-spacing:-0.3px;">VCS</p>`}
            </td>
          </tr>
          <tr>
            <td style="padding:36px 40px;">
              <p style="margin:0 0 6px;font-size:22px;font-weight:600;color:#18181b;letter-spacing:-0.4px;">Register a new device</p>
              <p style="margin:0 0 28px;font-size:15px;color:#71717a;line-height:1.6;">Hi ${employeeName}, open this link on the new device to register it. The link expires in 1 hour.</p>
              <table cellpadding="0" cellspacing="0">
                <tr>
                  <td style="border-radius:8px;background:#18181b;">
                    <a href="${link}" target="_blank" style="display:inline-block;padding:12px 28px;font-size:14px;font-weight:600;color:#ffffff;text-decoration:none;letter-spacing:-0.1px;">Register device →</a>
                  </td>
                </tr>
              </table>
              <p style="margin:28px 0 0;font-size:12px;color:#a1a1aa;word-break:break-all;">Or copy this link: ${link}</p>
            </td>
          </tr>
          <tr>
            <td style="padding:20px 40px;border-top:1px solid #f4f4f5;">
              <p style="margin:0;font-size:12px;color:#a1a1aa;line-height:1.6;">If you didn't request this, you can safely ignore it.</p>
            </td>
          </tr>
        </table>
      </td></tr>
    </table>
  </body>
  </html>`

      const textBody = `Hi ${employeeName},\n\nOpen this link on your new device to register it.\nThe link expires in 1 hour.\n\n${link}\n\nIf you didn't request this, you can safely ignore it.`

      await transporter.sendMail({
        from: SMTP_FROM,
        to: email,
        subject: 'Register a new device',
        text: textBody,
        html: htmlBody,
      })

      res.status(204).end()
    } catch (err) {
      console.error('[webauthn-magic-link send]', err)
      res.status(500).json({ error: 'Failed to send email' })
    }
  }

  async function handleValidateToken(req: VercelRequest, res: VercelResponse): Promise<void> {
    const token = typeof req.query.token === 'string' ? req.query.token : null
    if (!token) {
      res.status(400).json({ error: 'Missing token' })
      return
    }
    try {
      const { employeeId } = await verifyMagicToken(token)
      const db = await getDb()
      const employee = await db.collection('employees').findOne({ _id: new ObjectId(employeeId) })
      if (!employee) {
        res.status(401).json({ error: 'Invalid token' })
        return
      }
      res.status(200).json({ employeeName: employee.name as string })
    } catch {
      res.status(401).json({ error: 'Invalid or expired link' })
    }
  }
  ```

- [ ] **Step 2: Verify the build compiles**

  Run: `npx tsc --noEmit`
  Expected: no errors

- [ ] **Step 3: Commit**

  ```bash
  git add api/webauthn-magic-link.ts
  git commit -m "feat: add webauthn-magic-link endpoint (send + validate)"
  ```

---

## Task 3: Create `api/webauthn-magic-link-complete.ts`

**Files:**
- Create: `api/webauthn-magic-link-complete.ts`

- [ ] **Step 1: Create the file**

  ```typescript
  import { z } from 'zod'
  import { ObjectId } from 'mongodb'
  import type { VercelRequest, VercelResponse } from '@vercel/node'
  import { getDb } from './_db.js'
  import { verifyMagicToken, signJwt, setAuthCookie } from './_auth.js'

  const BodySchema = z.object({ token: z.string().min(1) })

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
    try {
      const { employeeId } = await verifyMagicToken(parsed.data.token)
      const db = await getDb()
      const employee = await db.collection('employees').findOne({ _id: new ObjectId(employeeId) })
      if (!employee) {
        res.status(401).json({ error: 'Invalid token' })
        return
      }
      const jwt = await signJwt({ employeeId, isAdmin: !!employee.isAdmin })
      setAuthCookie(res, jwt)
      res.status(200).json({ success: true })
    } catch {
      res.status(401).json({ error: 'Invalid or expired link' })
    }
  }
  ```

- [ ] **Step 2: Verify the build compiles**

  Run: `npx tsc --noEmit`
  Expected: no errors

- [ ] **Step 3: Commit**

  ```bash
  git add api/webauthn-magic-link-complete.ts
  git commit -m "feat: add webauthn-magic-link-complete endpoint (issue auth cookie)"
  ```

---

## Task 4: Update `api/webauthn-register-options.ts` to accept magic token

**Files:**
- Modify: `api/webauthn-register-options.ts`

- [ ] **Step 1: Replace `requireAuth` import with `resolveAuth`, update call site**

  Change the import line from:
  ```typescript
  import { requireAuth } from './_auth.js'
  ```
  To:
  ```typescript
  import { resolveAuth } from './_auth.js'
  ```

  Change the call site from:
  ```typescript
  const auth = await requireAuth(req, res)
  ```
  To:
  ```typescript
  const auth = await resolveAuth(req, res)
  ```

- [ ] **Step 2: Verify the build compiles**

  Run: `npx tsc --noEmit`
  Expected: no errors

- [ ] **Step 3: Commit**

  ```bash
  git add api/webauthn-register-options.ts
  git commit -m "feat: accept X-Magic-Token in webauthn-register-options"
  ```

---

## Task 5: Update `api/webauthn-register-verify.ts` to accept magic token

**Files:**
- Modify: `api/webauthn-register-verify.ts`

- [ ] **Step 1: Replace `requireAuth` import with `resolveAuth`, update call site**

  Change the import line from:
  ```typescript
  import { requireAuth } from './_auth.js'
  ```
  To:
  ```typescript
  import { resolveAuth } from './_auth.js'
  ```

  Change the call site from:
  ```typescript
  const auth = await requireAuth(req, res)
  ```
  To:
  ```typescript
  const auth = await resolveAuth(req, res)
  ```

- [ ] **Step 2: Verify the build compiles**

  Run: `npx tsc --noEmit`
  Expected: no errors

- [ ] **Step 3: Commit**

  ```bash
  git add api/webauthn-register-verify.ts
  git commit -m "feat: accept X-Magic-Token in webauthn-register-verify"
  ```

---

## Task 6: Add API wrappers to `src/lib/mongoApi.ts`

**Files:**
- Modify: `src/lib/mongoApi.ts`

- [ ] **Step 1: Extend `getWebAuthnRegisterOptions` to accept an optional magic token**

  Replace:
  ```typescript
  export async function getWebAuthnRegisterOptions(): Promise<unknown> {
    const res = await fetch('/api/webauthn-register-options', { method: 'GET' })
    if (!res.ok) {
      const text = await res.text().catch(() => res.statusText)
      throw new Error(`API error ${res.status}: ${text}`)
    }
    return res.json()
  }
  ```
  With:
  ```typescript
  export async function getWebAuthnRegisterOptions(magicToken?: string): Promise<unknown> {
    const headers: Record<string, string> = {}
    if (magicToken) headers['X-Magic-Token'] = magicToken
    const res = await fetch('/api/webauthn-register-options', { method: 'GET', headers })
    if (!res.ok) {
      const text = await res.text().catch(() => res.statusText)
      throw new Error(`API error ${res.status}: ${text}`)
    }
    return res.json()
  }
  ```

- [ ] **Step 2: Extend `verifyWebAuthnRegistration` to accept an optional magic token**

  Replace:
  ```typescript
  export async function verifyWebAuthnRegistration(
    response: unknown,
    deviceName?: string
  ): Promise<void> {
    const res = await fetch('/api/webauthn-register-verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ response, deviceName }),
    })
    if (!res.ok) {
      const text = await res.text().catch(() => res.statusText)
      throw new Error(`API error ${res.status}: ${text}`)
    }
  }
  ```
  With:
  ```typescript
  export async function verifyWebAuthnRegistration(
    response: unknown,
    deviceName?: string,
    magicToken?: string
  ): Promise<void> {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' }
    if (magicToken) headers['X-Magic-Token'] = magicToken
    const res = await fetch('/api/webauthn-register-verify', {
      method: 'POST',
      headers,
      body: JSON.stringify({ response, deviceName }),
    })
    if (!res.ok) {
      const text = await res.text().catch(() => res.statusText)
      throw new Error(`API error ${res.status}: ${text}`)
    }
  }
  ```

- [ ] **Step 3: Add the three new API wrapper functions**

  Append these three functions at the bottom of the `// ── WebAuthn` section (after `deleteWebAuthnCredential`):

  ```typescript
  export async function sendDeviceRegistrationLink(): Promise<void> {
    const res = await fetch('/api/webauthn-magic-link', { method: 'POST' })
    if (!res.ok) {
      const text = await res.text().catch(() => res.statusText)
      throw new Error(`API error ${res.status}: ${text}`)
    }
  }

  export async function validateMagicToken(token: string): Promise<{ employeeName: string }> {
    return apiFetch(
      `/api/webauthn-magic-link?token=${encodeURIComponent(token)}`,
      { method: 'GET' },
      z.object({ employeeName: z.string() })
    )
  }

  export async function completeDeviceRegistration(token: string): Promise<void> {
    const res = await fetch('/api/webauthn-magic-link-complete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token }),
    })
    if (!res.ok) {
      const text = await res.text().catch(() => res.statusText)
      throw new Error(`API error ${res.status}: ${text}`)
    }
  }
  ```

- [ ] **Step 4: Verify the build compiles**

  Run: `npx tsc --noEmit`
  Expected: no errors

- [ ] **Step 5: Commit**

  ```bash
  git add src/lib/mongoApi.ts
  git commit -m "feat: add magic-link API wrappers to mongoApi"
  ```

---

## Task 7: Create `src/pages/RegisterDevice.tsx`

**Files:**
- Create: `src/pages/RegisterDevice.tsx`

- [ ] **Step 1: Create the file**

  ```typescript
  import { useEffect, useState } from 'react'
  import { startRegistration } from '@simplewebauthn/browser'
  import { CheckCircle2, Loader2, XCircle } from 'lucide-react'
  import { Button } from '@/components/ui/button'
  import {
    validateMagicToken,
    getWebAuthnRegisterOptions,
    verifyWebAuthnRegistration,
    completeDeviceRegistration,
  } from '@/lib/mongoApi'

  type PageState =
    | { status: 'loading' }
    | { status: 'ready'; employeeName: string }
    | { status: 'registering' }
    | { status: 'success' }
    | { status: 'error'; message: string }

  export default function RegisterDevice() {
    const token = new URLSearchParams(window.location.search).get('token') ?? ''
    const [state, setState] = useState<PageState>({ status: 'loading' })

    useEffect(() => {
      if (!token) {
        setState({ status: 'error', message: 'No token provided.' })
        return
      }
      validateMagicToken(token)
        .then(({ employeeName }) => setState({ status: 'ready', employeeName }))
        .catch(() =>
          setState({ status: 'error', message: 'This link is invalid or has expired.' })
        )
    }, [token])

    const handleRegister = async () => {
      setState({ status: 'registering' })
      try {
        const options = await getWebAuthnRegisterOptions(token)
        const response = await startRegistration({ optionsJSON: options as never })
        await verifyWebAuthnRegistration(response, undefined, token)
        await completeDeviceRegistration(token)
        setState({ status: 'success' })
        setTimeout(() => {
          window.location.href = '/'
        }, 1500)
      } catch (err) {
        setState({
          status: 'error',
          message: err instanceof Error ? err.message : 'Registration failed.',
        })
      }
    }

    return (
      <div className='min-h-screen flex items-center justify-center bg-background p-4'>
        <div className='w-full max-w-sm space-y-6 text-center'>
          {state.status === 'loading' && (
            <Loader2 className='mx-auto h-8 w-8 animate-spin text-muted-foreground' />
          )}

          {state.status === 'ready' && (
            <>
              <div className='space-y-1'>
                <h1 className='text-2xl font-semibold tracking-tight'>Register this device</h1>
                <p className='text-sm text-muted-foreground'>for {state.employeeName}</p>
              </div>
              <Button className='w-full' onClick={handleRegister}>
                Register Device
              </Button>
            </>
          )}

          {state.status === 'registering' && (
            <>
              <Loader2 className='mx-auto h-8 w-8 animate-spin' />
              <p className='text-sm text-muted-foreground'>Waiting for biometric confirmation…</p>
            </>
          )}

          {state.status === 'success' && (
            <>
              <CheckCircle2 className='mx-auto h-10 w-10 text-green-500' />
              <p className='text-sm text-muted-foreground'>Device registered! Redirecting…</p>
            </>
          )}

          {state.status === 'error' && (
            <>
              <XCircle className='mx-auto h-10 w-10 text-destructive' />
              <p className='font-medium'>{state.message}</p>
              <a
                href='/login'
                className='text-sm text-muted-foreground underline underline-offset-4'
              >
                Back to login
              </a>
            </>
          )}
        </div>
      </div>
    )
  }
  ```

- [ ] **Step 2: Verify the build compiles**

  Run: `npx tsc --noEmit`
  Expected: no errors

- [ ] **Step 3: Commit**

  ```bash
  git add src/pages/RegisterDevice.tsx
  git commit -m "feat: add RegisterDevice page for magic-link flow"
  ```

---

## Task 8: Register the route in `src/App.tsx`

**Files:**
- Modify: `src/App.tsx`

- [ ] **Step 1: Add the import**

  After the last page import (the `ChangePassword` import), add:
  ```typescript
  import RegisterDevice from '@/pages/RegisterDevice'
  ```

- [ ] **Step 2: Add the route**

  After `<Route path='/change-password' element={<ProtectedRoute><ChangePassword /></ProtectedRoute>} />`, add:
  ```tsx
  <Route path='/register-device' element={<RegisterDevice />} />
  ```

  Note: This route is intentionally NOT wrapped in `<ProtectedRoute>` — the user is not authenticated when they open the magic link.

- [ ] **Step 3: Verify the build compiles**

  Run: `npx tsc --noEmit`
  Expected: no errors

- [ ] **Step 4: Commit**

  ```bash
  git add src/App.tsx
  git commit -m "feat: register /register-device route in App"
  ```

---

## Task 9: Add "Send registration link" button to `src/components/ProfileModal.tsx`

**Files:**
- Modify: `src/components/ProfileModal.tsx`

- [ ] **Step 1: Add `sendDeviceRegistrationLink` to the import from `@/lib/mongoApi`**

  Change:
  ```typescript
  import { fetchWebAuthnCredentials, deleteWebAuthnCredential } from '@/lib/mongoApi'
  ```
  To:
  ```typescript
  import { fetchWebAuthnCredentials, deleteWebAuthnCredential, sendDeviceRegistrationLink } from '@/lib/mongoApi'
  ```

- [ ] **Step 2: Add `sendingLink` state**

  After the `deletingId` state declaration:
  ```typescript
  const [deletingId, setDeletingId] = useState<string | null>(null)
  ```
  Add:
  ```typescript
  const [sendingLink, setSendingLink] = useState(false)
  ```

- [ ] **Step 3: Add the `handleSendLink` handler**

  After the `handleDeleteDevice` function and before `handleOpenChange`, add:
  ```typescript
  const handleSendLink = async () => {
    setSendingLink(true)
    try {
      await sendDeviceRegistrationLink()
      toast.success('Registration link sent to your email')
    } catch (err) {
      toast.error('Failed to send link', {
        description: err instanceof Error ? err.message : 'Unknown error',
      })
    } finally {
      setSendingLink(false)
    }
  }
  ```

- [ ] **Step 4: Add the button to the JSX**

  After the existing "Register New Device" button:
  ```tsx
  <Button
    type='button'
    variant='outline'
    className='w-full'
    disabled={registeringBio}
    onClick={handleRegisterBiometric}
  >
    {registeringBio && <Loader2 className='mr-2 h-4 w-4 animate-spin' />}
    {registeringBio ? 'Waiting for biometric…' : 'Register New Device'}
  </Button>
  ```
  Add immediately after:
  ```tsx
  <Button
    type='button'
    variant='ghost'
    className='w-full text-muted-foreground'
    disabled={sendingLink}
    onClick={handleSendLink}
  >
    {sendingLink && <Loader2 className='mr-2 h-4 w-4 animate-spin' />}
    {sendingLink ? 'Sending…' : 'Send registration link to my email'}
  </Button>
  ```

- [ ] **Step 5: Verify the build compiles**

  Run: `npx tsc --noEmit`
  Expected: no errors

- [ ] **Step 6: Verify the dev server runs without errors**

  Run: `npm run dev`
  Expected: dev server starts cleanly, no TypeScript or import errors in the console.

- [ ] **Step 7: Manual end-to-end verification**

  1. Log in to the app as a user who has an email address on file
  2. Open Profile modal → scroll to Biometric / Passkeys section
  3. Click "Send registration link to my email" — expect toast "Registration link sent to your email"
  4. Open the email — expect subject "Register a new device", link containing `/register-device?token=`
  5. Open the link in a different browser or incognito window
  6. Expect: page loads with "Register this device for `<your name>`" and a "Register Device" button
  7. Click "Register Device" — complete the biometric/passkey prompt
  8. Expect: success checkmark, then redirect to `/` and you are logged in
  9. Return to the profile modal — the new device should appear in the registered devices list

- [ ] **Step 8: Commit**

  ```bash
  git add src/components/ProfileModal.tsx
  git commit -m "feat: add send-registration-link button to ProfileModal"
  ```

---

## Edge Cases to Manually Verify

| Scenario | Expected behaviour |
|----------|-------------------|
| User has no email on file | Toast: "No email address on file for your account" |
| Link opened after 1 hour | Page shows "This link is invalid or has expired." with link back to login |
| Link token tampered/invalid | Same error page as expired |
| User cancels biometric prompt | Error state shown on page; user can retry by refreshing |
| Existing cookie + magic token on same request | Cookie wins; existing session unaffected |
