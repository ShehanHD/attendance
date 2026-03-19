import { z } from 'zod'

export const EmployeeSchema = z.object({
  _id: z.string(),
  name: z.string(),
  standardHours: z.number().int().positive(),
  isAdmin: z.boolean(),
  isActive: z.boolean().default(true),
})

export const AttendanceEntryTypeSchema = z.enum([
  'present',
  'absent',
  'vacation',
  'sick',
])

export const AttendanceEntrySchema = z.object({
  _id: z.string(),
  employeeId: z.string(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  type: AttendanceEntryTypeSchema,
  hours: z.number().min(0).max(24),
  // sickRef conditionality (required when type="sick") is enforced by the
  // pre-save UI guard — not by a schema refinement — to avoid rejecting
  // valid API responses where type !== "sick" and sickRef is null.
  sickRef: z.string().trim().min(1).max(200).nullable(),
})

export const CompanyClosureSchema = z.object({
  _id: z.string(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  note: z.string().nullable(),
})

export type Employee = z.infer<typeof EmployeeSchema>
export type AttendanceEntryType = z.infer<typeof AttendanceEntryTypeSchema>
export type AttendanceEntry = z.infer<typeof AttendanceEntrySchema>
export type CompanyClosure = z.infer<typeof CompanyClosureSchema>
