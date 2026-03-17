import { EmployeeSchema } from './schemas'
import type { Employee } from './schemas'

const KEY = 'selectedEmployee'

export function getSessionEmployee(): Employee | null {
  try {
    const raw = sessionStorage.getItem(KEY)
    if (!raw) return null
    return EmployeeSchema.parse(JSON.parse(raw))
  } catch {
    return null
  }
}

export function setSessionEmployee(employee: Employee): void {
  sessionStorage.setItem(KEY, JSON.stringify(employee))
}

export function clearSessionEmployee(): void {
  sessionStorage.removeItem(KEY)
}
