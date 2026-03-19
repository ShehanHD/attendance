import { describe, it, expect } from 'vitest'
import { EmployeeSchema } from './schemas'

describe('EmployeeSchema', () => {
  const base = { _id: '1', name: 'Alice', standardHours: 8, isAdmin: false }

  it('defaults isActive to true when field is absent', () => {
    expect(EmployeeSchema.parse(base).isActive).toBe(true)
  })

  it('preserves isActive: false', () => {
    expect(EmployeeSchema.parse({ ...base, isActive: false }).isActive).toBe(false)
  })

  it('accepts isActive: true explicitly', () => {
    expect(EmployeeSchema.parse({ ...base, isActive: true }).isActive).toBe(true)
  })

  it('rejects non-integer standardHours', () => {
    expect(() => EmployeeSchema.parse({ ...base, standardHours: 7.5 })).toThrow()
  })

  it('rejects zero standardHours', () => {
    expect(() => EmployeeSchema.parse({ ...base, standardHours: 0 })).toThrow()
  })

  it('rejects negative standardHours', () => {
    expect(() => EmployeeSchema.parse({ ...base, standardHours: -1 })).toThrow()
  })
})
