import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { VercelRequest, VercelResponse } from '@vercel/node'

// ── DB mock ──────────────────────────────────────────────────────────────────
const mockFindEntries = vi.fn()
const mockFindEmployees = vi.fn()

vi.mock('./_db.js', () => ({
  getDb: vi.fn().mockResolvedValue({
    collection: vi.fn((name: string) =>
      name === 'attendance_entries'
        ? { find: mockFindEntries }
        : { find: mockFindEmployees }
    ),
  }),
}))

// ── Auth mock ─────────────────────────────────────────────────────────────────
vi.mock('./_auth.js', () => ({
  requireAuth: vi.fn().mockResolvedValue({ _id: 'admin1', isAdmin: true }),
}))

// ── Nodemailer mock ───────────────────────────────────────────────────────────
const mockSendMail = vi.hoisted(() => vi.fn().mockResolvedValue({ messageId: 'test-id' }))
vi.mock('nodemailer', () => ({
  default: { createTransport: vi.fn().mockReturnValue({ sendMail: mockSendMail }) },
}))

// ── xlsx mock ─────────────────────────────────────────────────────────────────
vi.mock('xlsx', () => ({
  utils: {
    aoa_to_sheet: vi.fn().mockReturnValue({}),
    book_new: vi.fn().mockReturnValue({}),
    book_append_sheet: vi.fn(),
  },
  write: vi.fn().mockReturnValue(Buffer.from('fake-xlsx')),
}))

import handler from './send-summary'

// ── Helpers ──────────────────────────────────────────────────────────────────
function makeReq(overrides: Partial<VercelRequest> = {}): VercelRequest {
  return { method: 'POST', headers: {}, body: { year: 2026, month: 3 }, ...overrides } as unknown as VercelRequest
}

function makeRes() {
  const json = vi.fn()
  const status = vi.fn().mockReturnValue({ json })
  return { status, json } as unknown as VercelResponse & { status: typeof status; json: typeof json }
}

// ── Fixtures ──────────────────────────────────────────────────────────────────
const adminWithEmail    = { _id: 'emp1', name: 'Admin',    isAdmin: true,  email: 'admin@example.com' }
const regularEmployee   = { _id: 'emp2', name: 'Regular',  isAdmin: false, email: 'user@example.com' }
const adminWithoutEmail = { _id: 'emp3', name: 'NoEmail',  isAdmin: true,  email: null }
const sampleEntries     = [
  { employeeId: 'emp1', date: '2026-03-01', type: 'present',  hours: 8, sickRef: null },
]

beforeEach(() => {
  vi.clearAllMocks()
  process.env.SMTP_HOST = 'smtp.test.com'
  process.env.SMTP_PORT = '587'
  process.env.SMTP_USER = 'test@test.com'
  process.env.SMTP_PASS = 'secret'
  process.env.SMTP_FROM = 'Test <test@test.com>'
  mockFindEntries.mockReturnValue({ toArray: vi.fn().mockResolvedValue(sampleEntries) })
  mockFindEmployees.mockReturnValue({ toArray: vi.fn().mockResolvedValue([adminWithEmail, regularEmployee, adminWithoutEmail]) })
})

afterEach(() => {
  vi.useRealTimers()
})

describe('POST /api/send-summary', () => {
  it('sends email only to admins with email set and returns sent count', async () => {
    const res = makeRes()
    await handler(makeReq(), res as unknown as VercelResponse)

    expect(mockSendMail).toHaveBeenCalledOnce()
    const mail = mockSendMail.mock.calls[0][0]
    expect(mail.to).toEqual(['admin@example.com'])
    expect(res.json).toHaveBeenCalledWith({ sent: 1 })
  })

  it('returns sent: 0 without sending when no admin has an email', async () => {
    mockFindEmployees.mockReturnValue({ toArray: vi.fn().mockResolvedValue([adminWithoutEmail]) })
    const res = makeRes()
    await handler(makeReq(), res as unknown as VercelResponse)

    expect(mockSendMail).not.toHaveBeenCalled()
    expect(res.json).toHaveBeenCalledWith({ sent: 0 })
  })

  it('returns 400 on invalid body', async () => {
    const res = makeRes()
    await handler(makeReq({ body: { year: 'bad', month: 99 } }), res as unknown as VercelResponse)
    expect(res.status).toHaveBeenCalledWith(400)
  })

  it('returns 500 when SMTP config is missing', async () => {
    delete process.env.SMTP_HOST
    const res = makeRes()
    await handler(makeReq(), res as unknown as VercelResponse)
    expect(res.status).toHaveBeenCalledWith(500)
  })

  it('attaches an xlsx file named summary-YYYY-MM.xlsx', async () => {
    const res = makeRes()
    await handler(makeReq(), res as unknown as VercelResponse)

    const mail = mockSendMail.mock.calls[0][0]
    expect(mail.attachments).toHaveLength(1)
    expect(mail.attachments[0].filename).toBe('summary-2026-03.xlsx')
    expect(mail.attachments[0].contentType).toBe(
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    )
  })

  it('includes HTML body in email', async () => {
    const res = makeRes()
    await handler(makeReq(), res as unknown as VercelResponse)

    const mail = mockSendMail.mock.calls[0][0]
    expect(mail.html).toContain('March 2026')
    expect(mail.html).toContain('<table')
  })

  it('email subject contains month name and year', async () => {
    const res = makeRes()
    await handler(makeReq(), res as unknown as VercelResponse)

    const mail = mockSendMail.mock.calls[0][0]
    expect(mail.subject).toBe('Attendance Summary — March 2026')
    expect(mail.from).toBe('Test <test@test.com>')
  })

  it('returns 500 when sendMail throws', async () => {
    mockSendMail.mockRejectedValueOnce(new Error('SMTP connection refused'))
    const res = makeRes()
    await handler(makeReq(), res as unknown as VercelResponse)
    expect(res.status).toHaveBeenCalledWith(500)
  })
})

describe('GET /api/send-summary (cron)', () => {
  it('skips sending when today is not the last day of the month', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 2, 15)) // March 15 — not last day

    const res = makeRes()
    await handler(makeReq({ method: 'GET', body: undefined, headers: { 'x-vercel-cron': '1' } }), res as unknown as VercelResponse)

    expect(mockSendMail).not.toHaveBeenCalled()
    expect(res.json).toHaveBeenCalledWith({ sent: 0, reason: 'not-last-day' })
  })

  it('sends when today is the last day of the month', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 2, 31)) // March 31 — last day

    const res = makeRes()
    await handler(makeReq({ method: 'GET', body: undefined, headers: { 'x-vercel-cron': '1' } }), res as unknown as VercelResponse)

    expect(mockSendMail).toHaveBeenCalledOnce()
    expect(res.json).toHaveBeenCalledWith({ sent: 1 })
  })
})
