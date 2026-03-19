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
    end: vi.fn(),
  } as unknown as VercelResponse
  ;(res.status as ReturnType<typeof vi.fn>).mockReturnValue(res)
  return res
}

function makeReq(method = 'GET', body?: unknown): VercelRequest {
  return { method, body } as VercelRequest
}

describe('GET /api/employees', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns employees with _id serialized to string', async () => {
    const objectId = { toString: () => 'abc123' }
    mockGetDb.mockResolvedValue({
      collection: () => ({
        find: () => ({
          toArray: async () => [
            { _id: objectId, name: 'Alice', standardHours: 8, isAdmin: false, isActive: true },
          ],
        }),
      }),
    } as never)

    const req = makeReq()
    const res = makeRes()
    await handler(req, res)

    expect((res.status as ReturnType<typeof vi.fn>).mock.calls[0][0]).toBe(200)
    expect((res.json as ReturnType<typeof vi.fn>).mock.calls[0][0]).toEqual({
      employees: [
        { _id: 'abc123', name: 'Alice', standardHours: 8, isAdmin: false, isActive: true },
      ],
    })
  })

  it('returns 500 when getDb throws', async () => {
    mockGetDb.mockRejectedValue(new Error('connection failed'))
    const req = makeReq()
    const res = makeRes()
    await handler(req, res)
    expect((res.status as ReturnType<typeof vi.fn>).mock.calls[0][0]).toBe(500)
  })
})

describe('POST /api/employees', () => {
  beforeEach(() => vi.clearAllMocks())

  it('creates an employee and returns 201 with the new employee', async () => {
    const insertedId = { toString: () => 'newid123' }
    mockGetDb.mockResolvedValue({
      collection: () => ({
        insertOne: async () => ({ insertedId }),
      }),
    } as never)

    const body = { name: 'Bob', standardHours: 8, isAdmin: false }
    const req = makeReq('POST', body)
    const res = makeRes()
    await handler(req, res)

    expect((res.status as ReturnType<typeof vi.fn>).mock.calls[0][0]).toBe(201)
    expect((res.json as ReturnType<typeof vi.fn>).mock.calls[0][0]).toEqual({
      employee: { _id: 'newid123', name: 'Bob', standardHours: 8, isAdmin: false, isActive: true },
    })
  })

  it('returns 400 for missing name', async () => {
    const req = makeReq('POST', { standardHours: 8, isAdmin: false })
    const res = makeRes()
    await handler(req, res)
    expect((res.status as ReturnType<typeof vi.fn>).mock.calls[0][0]).toBe(400)
  })

  it('returns 400 for non-integer standardHours', async () => {
    const req = makeReq('POST', { name: 'Bob', standardHours: 7.5, isAdmin: false })
    const res = makeRes()
    await handler(req, res)
    expect((res.status as ReturnType<typeof vi.fn>).mock.calls[0][0]).toBe(400)
  })

  it('returns 500 when getDb throws', async () => {
    mockGetDb.mockRejectedValue(new Error('db error'))
    const req = makeReq('POST', { name: 'Bob', standardHours: 8, isAdmin: false })
    const res = makeRes()
    await handler(req, res)
    expect((res.status as ReturnType<typeof vi.fn>).mock.calls[0][0]).toBe(500)
  })
})

describe('PUT /api/employees', () => {
  beforeEach(() => vi.clearAllMocks())

  const VALID_ID = '507f1f77bcf86cd799439011'

  it('updates an employee and returns 200 with the updated employee', async () => {
    const objectId = { toString: () => VALID_ID }
    mockGetDb.mockResolvedValue({
      collection: () => ({
        findOneAndUpdate: async () => ({
          _id: objectId,
          name: 'Alice Updated',
          standardHours: 7,
          isAdmin: true,
          isActive: true,
        }),
      }),
    } as never)

    const body = {
      _id: VALID_ID,
      name: 'Alice Updated',
      standardHours: 7,
      isAdmin: true,
      isActive: true,
    }
    const req = makeReq('PUT', body)
    const res = makeRes()
    await handler(req, res)

    expect((res.status as ReturnType<typeof vi.fn>).mock.calls[0][0]).toBe(200)
    expect((res.json as ReturnType<typeof vi.fn>).mock.calls[0][0]).toEqual({
      employee: {
        _id: VALID_ID,
        name: 'Alice Updated',
        standardHours: 7,
        isAdmin: true,
        isActive: true,
      },
    })
  })

  it('returns 404 when employee is not found', async () => {
    mockGetDb.mockResolvedValue({
      collection: () => ({
        findOneAndUpdate: async () => null,
      }),
    } as never)

    const req = makeReq('PUT', {
      _id: VALID_ID,
      name: 'Alice',
      standardHours: 8,
      isAdmin: false,
      isActive: true,
    })
    const res = makeRes()
    await handler(req, res)
    expect((res.status as ReturnType<typeof vi.fn>).mock.calls[0][0]).toBe(404)
  })

  it('returns 400 for invalid _id format', async () => {
    const req = makeReq('PUT', {
      _id: 'not-a-valid-objectid',
      name: 'Alice',
      standardHours: 8,
      isAdmin: false,
      isActive: true,
    })
    const res = makeRes()
    await handler(req, res)
    expect((res.status as ReturnType<typeof vi.fn>).mock.calls[0][0]).toBe(400)
  })

  it('returns 400 for missing body fields', async () => {
    const req = makeReq('PUT', { _id: VALID_ID })
    const res = makeRes()
    await handler(req, res)
    expect((res.status as ReturnType<typeof vi.fn>).mock.calls[0][0]).toBe(400)
  })

  it('returns 500 when getDb throws', async () => {
    mockGetDb.mockRejectedValue(new Error('db error'))
    const req = makeReq('PUT', {
      _id: VALID_ID,
      name: 'Alice',
      standardHours: 8,
      isAdmin: false,
      isActive: true,
    })
    const res = makeRes()
    await handler(req, res)
    expect((res.status as ReturnType<typeof vi.fn>).mock.calls[0][0]).toBe(500)
  })
})

describe('unsupported methods', () => {
  it('returns 405 for DELETE', async () => {
    const req = makeReq('DELETE')
    const res = makeRes()
    await handler(req, res)
    expect((res.status as ReturnType<typeof vi.fn>).mock.calls[0][0]).toBe(405)
  })
})
