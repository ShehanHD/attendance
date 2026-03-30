// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { VercelRequest, VercelResponse } from '@vercel/node'

vi.mock('./_db.js', () => ({
  getDb: vi.fn(),
}))

import { getDb } from './_db.js'
import handler from './cron-init-month.js'

const mockGetDb = vi.mocked(getDb)

function makeRes(): VercelResponse {
  const res = {
    status: vi.fn(),
    json: vi.fn(),
    end: vi.fn(),
  } as unknown as VercelResponse
  ;(res.status as ReturnType<typeof vi.fn>).mockReturnValue(res)
  return res
}

function makeReq(
  overrides: Partial<{ method: string; headers: Record<string, string> }> = {}
): VercelRequest {
  return {
    method: 'POST',
    headers: { authorization: 'Bearer test-secret' },
    ...overrides,
  } as unknown as VercelRequest
}

function makeDb({
  employees = [{ _id: { toString: () => 'emp1' }, standardHours: 8 }] as unknown[],
  closures = [] as unknown[],
  existingCount = 0,
  insertMany = vi.fn().mockResolvedValue({}),
} = {}) {
  const countDocuments = vi.fn().mockResolvedValue(existingCount)
  const collections: Record<string, unknown> = {
    employees: { find: () => ({ toArray: () => Promise.resolve(employees) }) },
    closures: { find: () => ({ toArray: () => Promise.resolve(closures) }) },
    attendance_entries: { countDocuments, insertMany },
  }
  mockGetDb.mockResolvedValue({
    collection: (name: string) => collections[name],
  } as never)
  return { countDocuments, insertMany }
}

// ── Auth ──────────────────────────────────────────────────────────────────────

describe('POST /api/cron-init-month — auth', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.env.CRON_SECRET = 'test-secret'
  })

  it('returns 401 when Authorization header is missing', async () => {
    const res = makeRes()
    await handler(makeReq({ headers: {} }), res)
    expect((res.status as ReturnType<typeof vi.fn>).mock.calls[0][0]).toBe(401)
  })

  it('returns 401 when Authorization header has wrong secret', async () => {
    const res = makeRes()
    await handler(makeReq({ headers: { authorization: 'Bearer wrong' } }), res)
    expect((res.status as ReturnType<typeof vi.fn>).mock.calls[0][0]).toBe(401)
  })

  it('returns 405 for non-POST methods', async () => {
    const res = makeRes()
    await handler(makeReq({ method: 'GET' }), res)
    expect((res.status as ReturnType<typeof vi.fn>).mock.calls[0][0]).toBe(405)
  })
})

// ── Initialization logic ──────────────────────────────────────────────────────

describe('POST /api/cron-init-month — initialization logic', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.env.CRON_SECRET = 'test-secret'
  })

  it('skips employees that already have entries and returns skipped count', async () => {
    const { insertMany } = makeDb({ existingCount: 5 })
    const res = makeRes()
    await handler(makeReq(), res)
    expect(insertMany).not.toHaveBeenCalled()
    const body = (res.json as ReturnType<typeof vi.fn>).mock.calls[0][0] as {
      initialized: number
      skipped: number
    }
    expect(body.skipped).toBe(1)
    expect(body.initialized).toBe(0)
  })

  it('inserts entries for employees with no existing data', async () => {
    const { insertMany } = makeDb({ existingCount: 0 })
    const res = makeRes()
    await handler(makeReq(), res)
    expect(insertMany).toHaveBeenCalledOnce()
    const body = (res.json as ReturnType<typeof vi.fn>).mock.calls[0][0] as {
      initialized: number
      skipped: number
    }
    expect(body.initialized).toBe(1)
    expect(body.skipped).toBe(0)
  })

  it('inserted entries have correct structure', async () => {
    const { insertMany } = makeDb({ existingCount: 0 })
    await handler(makeReq(), makeRes())
    const docs = insertMany.mock.calls[0][0] as Array<Record<string, unknown>>
    expect(docs.length).toBeGreaterThan(0)
    const first = docs[0]
    expect(first.employeeId).toBe('emp1')
    expect(typeof first.date).toBe('string')
    expect(first.date).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    expect(['present', 'vacation']).toContain(first.type)
    expect(typeof first.hours).toBe('number')
    expect(first.sickRef).toBeNull()
  })

  it('marks company closure days as vacation with 0 hours', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-06-15'))
    try {
      const closureDate = '2026-06-03'
      const { insertMany } = makeDb({
        existingCount: 0,
        closures: [{ date: closureDate, endDate: closureDate, note: null }],
      })
      await handler(makeReq(), makeRes())
      const docs = insertMany.mock.calls[0][0] as Array<Record<string, unknown>>
      const closureEntry = docs.find(d => d.date === closureDate)
      expect(closureEntry).toBeDefined()
      expect(closureEntry!.type).toBe('vacation')
      expect(closureEntry!.hours).toBe(0)
    } finally {
      vi.useRealTimers()
    }
  })

  it('returns 500 when DB throws', async () => {
    mockGetDb.mockRejectedValue(new Error('db error'))
    const res = makeRes()
    await handler(makeReq(), res)
    expect((res.status as ReturnType<typeof vi.fn>).mock.calls[0][0]).toBe(500)
  })
})
