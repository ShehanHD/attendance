// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { VercelRequest, VercelResponse } from '@vercel/node'

vi.mock('./_db.js', () => ({
  getDb: vi.fn(),
}))

import { getDb } from './_db.js'
import handler from './entries.js'

const mockGetDb = vi.mocked(getDb)

function makeRes() {
  const res = {
    status: vi.fn(),
    json: vi.fn(),
    end: vi.fn(),
  } as unknown as VercelResponse
  ;(res.status as ReturnType<typeof vi.fn>).mockReturnValue(res)
  return res
}

function makeGetReq(query: Record<string, string>): VercelRequest {
  return { method: 'GET', query } as unknown as VercelRequest
}

function makePostReq(body: unknown): VercelRequest {
  return { method: 'POST', body } as unknown as VercelRequest
}

const mockEntry = {
  _id: { toString: () => 'ent789' },
  employeeId: 'emp1',
  date: '2026-03-01',
  type: 'present',
  hours: 8,
  sickRef: null,
}

describe('GET /api/entries — single employee', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns entries filtered by employeeId + month, _id as string', async () => {
    const toArray = vi.fn().mockResolvedValue([mockEntry])
    mockGetDb.mockResolvedValue({
      collection: () => ({ find: () => ({ toArray }) }),
    } as never)

    const req = makeGetReq({ employeeId: 'emp1', year: '2026', month: '3' })
    const res = makeRes()
    await handler(req, res)

    expect((res.status as ReturnType<typeof vi.fn>).mock.calls[0][0]).toBe(200)
    const body = (res.json as ReturnType<typeof vi.fn>).mock.calls[0][0]
    expect(body.entries[0]._id).toBe('ent789')
    expect(body.entries[0].employeeId).toBe('emp1')
  })

  it('returns 400 when year is missing', async () => {
    const req = makeGetReq({ employeeId: 'emp1', month: '3' })
    const res = makeRes()
    await handler(req, res)

    expect((res.status as ReturnType<typeof vi.fn>).mock.calls[0][0]).toBe(400)
  })

  it('returns 400 when month is missing', async () => {
    const req = makeGetReq({ employeeId: 'emp1', year: '2026' })
    const res = makeRes()
    await handler(req, res)

    expect((res.status as ReturnType<typeof vi.fn>).mock.calls[0][0]).toBe(400)
  })
})

describe('GET /api/entries — all employees (Summary page)', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns all entries for the month when no employeeId', async () => {
    const toArray = vi.fn().mockResolvedValue([mockEntry])
    mockGetDb.mockResolvedValue({
      collection: () => ({ find: () => ({ toArray }) }),
    } as never)

    const req = makeGetReq({ year: '2026', month: '3' })
    const res = makeRes()
    await handler(req, res)

    expect((res.status as ReturnType<typeof vi.fn>).mock.calls[0][0]).toBe(200)
    const body = (res.json as ReturnType<typeof vi.fn>).mock.calls[0][0]
    expect(body.entries).toHaveLength(1)
  })
})

describe('POST /api/entries', () => {
  beforeEach(() => vi.clearAllMocks())

  it('deletes then inserts, stripping _id from entries', async () => {
    const deleteMany = vi.fn().mockResolvedValue({ deletedCount: 1 })
    const insertMany = vi.fn().mockResolvedValue({ insertedCount: 1 })
    mockGetDb.mockResolvedValue({
      collection: () => ({ deleteMany, insertMany }),
    } as never)

    const entry = { _id: 'old-id', employeeId: 'emp1', date: '2026-03-01', type: 'present', hours: 8, sickRef: null }
    const req = makePostReq({ employeeId: 'emp1', year: 2026, month: 3, entries: [entry] })
    const res = makeRes()
    await handler(req, res)

    expect(deleteMany).toHaveBeenCalledOnce()
    expect(insertMany).toHaveBeenCalledOnce()
    // _id must be stripped before insert
    const insertedDocs = insertMany.mock.calls[0][0] as unknown[]
    expect((insertedDocs[0] as Record<string, unknown>)['_id']).toBeUndefined()
    expect((res.status as ReturnType<typeof vi.fn>).mock.calls[0][0]).toBe(204)
  })

  it('skips insertMany when entries array is empty', async () => {
    const deleteMany = vi.fn().mockResolvedValue({ deletedCount: 0 })
    const insertMany = vi.fn()
    mockGetDb.mockResolvedValue({
      collection: () => ({ deleteMany, insertMany }),
    } as never)

    const req = makePostReq({ employeeId: 'emp1', year: 2026, month: 3, entries: [] })
    const res = makeRes()
    await handler(req, res)

    expect(deleteMany).toHaveBeenCalledOnce()
    expect(insertMany).not.toHaveBeenCalled()
    expect((res.status as ReturnType<typeof vi.fn>).mock.calls[0][0]).toBe(204)
  })

  it('returns 400 when body is missing required fields', async () => {
    const req = makePostReq({ entries: [] }) // missing employeeId, year, month
    const res = makeRes()
    await handler(req, res)

    expect((res.status as ReturnType<typeof vi.fn>).mock.calls[0][0]).toBe(400)
  })

  it('returns 500 when deleteMany throws', async () => {
    mockGetDb.mockResolvedValue({
      collection: () => ({ deleteMany: vi.fn().mockRejectedValue(new Error('db error')) }),
    } as never)

    const req = makePostReq({ employeeId: 'emp1', year: 2026, month: 3, entries: [] })
    const res = makeRes()
    await handler(req, res)

    expect((res.status as ReturnType<typeof vi.fn>).mock.calls[0][0]).toBe(500)
  })

  it('returns 405 for unsupported methods', async () => {
    const req = { method: 'DELETE', query: {}, body: {} } as unknown as VercelRequest
    const res = makeRes()
    await handler(req, res)

    expect((res.status as ReturnType<typeof vi.fn>).mock.calls[0][0]).toBe(405)
  })
})
