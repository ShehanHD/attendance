# Magic Link Device Registration — Design Spec

**Date:** 2026-03-31  
**Status:** Approved  
**Feature:** Send a magic link via email to register a WebAuthn device without username/password login

---

## Overview

When a logged-in user wants to add a new WebAuthn device (e.g., a phone or tablet where they don't have their password), they can request a magic link from the Profile modal. The link is sent to their registered email address. Clicking it on the new device opens a registration page that runs the full WebAuthn registration flow and then automatically logs the user in — no password required.

---

## Approach: JWT Magic Token (stateless)

The token is a signed JWT (`{ sub: employeeId, purpose: "device-registration", exp: now+1h }`) using the existing `JWT_SECRET` and `jose` library. No new database collections are needed. The link remains valid for 1 hour and can be used to register multiple devices within that window.

---

## Architecture & Data Flow

```
[ProfileModal]
  └─ "Send registration link" button
       │
       ▼
POST /api/webauthn-magic-link
  - requireAuth (cookie session)
  - Signs JWT: { sub: employeeId, purpose: "device-registration", exp: now+1h }
  - Sends email to employee.email with link: APP_URL/register-device?token=<jwt>
  - Returns 204

[User opens link on new device]
  └─ React route: /register-device?token=<jwt>
       │
       ▼
RegisterDevicePage
  - On mount: GET /api/webauthn-magic-link?token=<jwt>
    → Verifies JWT signature + expiry + purpose claim
    → Returns { employeeName }
  - Shows "Register this device for <name>" UI
  - Runs WebAuthn registration:
      GET  /api/webauthn-register-options   (X-Magic-Token header)
      POST /api/webauthn-register-verify    (X-Magic-Token header)
  - On success: POST /api/webauthn-magic-link-complete
    → Issues auth cookie
    → Frontend redirects to /
```

---

## API Endpoints

### New endpoints

**`POST /api/webauthn-magic-link`**
- Auth: `requireAuth` (existing cookie session required)
- Signs JWT with `purpose: "device-registration"`, 1h expiry
- Fetches employee email from MongoDB
- Sends email via existing nodemailer transporter
- Returns `204 No Content`
- Errors: `422` if no email on file, `500` on SMTP failure

**`GET /api/webauthn-magic-link?token=<jwt>`**
- Auth: public (no cookie needed)
- Verifies JWT signature, expiry, and `purpose === "device-registration"`
- Returns `{ employeeName: string }`
- Returns `401` if token invalid or expired

**`POST /api/webauthn-magic-link-complete`**
- Auth: public
- Body: `{ token: string }`
- Verifies JWT → extracts `employeeId` → issues standard auth cookie
- Returns `200`
- Note: flat naming (`-complete` suffix) to match Vercel file-based routing convention used across the project

### Modified endpoints

**`GET /api/webauthn-register-options`** and **`POST /api/webauthn-register-verify`**
- Existing behavior unchanged when auth cookie is present
- Fallback: if no cookie, check `X-Magic-Token` header → verify JWT → extract `employeeId`
- Cookie takes precedence over magic token when both are present

---

## Frontend Components

### `ProfileModal.tsx` (modified)
- Add "Send registration link to my email" button in the Biometric/Passkeys section
- On click: `POST /api/webauthn-magic-link` → toast "Link sent to your email" or error toast
- Loading state on button during request

### `src/pages/RegisterDevice.tsx` (new)
- Route: `/register-device`
- On mount: reads `?token=` from URL, calls `GET /api/webauthn-magic-link?token=`
  - Invalid/expired → shows error message with link back to login
  - Valid → shows "Register this device for `<employeeName>`" with "Register Device" button
- On button click: runs WebAuthn registration flow passing `X-Magic-Token` header
- On success: calls `POST /api/webauthn-magic-link-complete` → `window.location.href = "/"`

### `src/lib/mongoApi.ts` (modified)
- `sendDeviceRegistrationLink()` — wraps `POST /api/webauthn-magic-link`
- `validateMagicToken(token)` — wraps `GET /api/webauthn-magic-link?token=`
- `completeDeviceRegistration(token)` — wraps `POST /api/webauthn-magic-link-complete`
- `startWebAuthnRegistration` / `verifyWebAuthnRegistration` — add optional `magicToken?: string` param that sets `X-Magic-Token` header when present

---

## Error Handling & Security

### Token security
- JWT signed with existing `JWT_SECRET` (HS256)
- `purpose: "device-registration"` claim prevents reuse in other JWT-verified flows
- 1-hour expiry enforced by `jose` on every verification call (stateless)

### Email
- `422` returned if employee has no email address on file
- SMTP errors surfaced as `500` with generic message — no internal details exposed to client

### WebAuthn magic token fallback
- `X-Magic-Token` fallback only activated when **no auth cookie** is present
- Token re-verified on every request — no server-side session state

### Frontend
- `RegisterDevicePage` validates token on mount before showing any UI
- Invalid/expired links show a clear error state, not a broken flow
- All errors surfaced via toast notifications, consistent with app patterns

### Attack surface
- The magic link can only register a WebAuthn credential for the token's `sub` (employeeId)
- Cannot be used to read data, change passwords, or act as another user
- No new secrets required — reuses existing `JWT_SECRET`

---

## Files Touched

| File | Change |
|------|--------|
| `api/webauthn-magic-link.ts` | New — handles POST (send link) + GET (validate token) |
| `api/webauthn-magic-link-complete.ts` | New — handles POST (issue auth cookie after successful registration) |
| `api/webauthn-register-options.ts` | Modified — add `X-Magic-Token` fallback |
| `api/webauthn-register-verify.ts` | Modified — add `X-Magic-Token` fallback |
| `src/pages/RegisterDevice.tsx` | New page component |
| `src/components/ProfileModal.tsx` | Add "Send registration link" button |
| `src/lib/mongoApi.ts` | Add 3 new API wrappers, extend existing registration helpers |
| `index.html` / router config | Add `/register-device` route |
| `vercel.json` | Add rewrite rule for `/register-device` → SPA fallback |
