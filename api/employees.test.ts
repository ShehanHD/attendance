// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { VercelRequest, VercelResponse } from '@vercel/node'

vi.mock('./_db.js', () => ({
  getDb: vi.fn(),
}))

import { getDb } from './_db.js'
import handler from './employees.js'

const mockGetDb = vi.mocked(getDb)

function makeRes() {
  const res = {
    status: vi.fn(),
    json: vi.fn(),
  } as unknown as VercelResponse
  ;(res.status as ReturnType<typeof vi.fn>).mockReturnValue(res)
  return res
}

function makeReq(method = 'GET'): VercelRequest {
  return { method } as VercelRequest
}

describe('GET /api/employees', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns employees with _id serialized to string', async () => {
    const objectId = { toString: () => 'abc123' }
    mockGetDb.mockResolvedValue({
      collection: () => ({
        find: () => ({ toArray: async () => [{ _id: objectId, name: 'Alice', standardHours: 8, isAdmin: false }] }),
      }),
    } as never)

    const req = makeReq()
    const res = makeRes()
    await handler(req, res)

    expect((res.status as ReturnType<typeof vi.fn>).mock.calls[0][0]).toBe(200)
    expect((res.json as ReturnType<typeof vi.fn>).mock.calls[0][0]).toEqual({
      employees: [{ _id: 'abc123', name: 'Alice', standardHours: 8, isAdmin: false }],
    })
  })

  it('returns 405 for non-GET methods', async () => {
    const req = makeReq('POST')
    const res = makeRes()
    await handler(req, res)

    expect((res.status as ReturnType<typeof vi.fn>).mock.calls[0][0]).toBe(405)
  })

  it('returns 500 when getDb throws', async () => {
    mockGetDb.mockRejectedValue(new Error('connection failed'))
    const req = makeReq()
    const res = makeRes()
    await handler(req, res)

    expect((res.status as ReturnType<typeof vi.fn>).mock.calls[0][0]).toBe(500)
  })
})
