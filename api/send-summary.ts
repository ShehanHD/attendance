import { z } from 'zod'
import * as XLSX from 'xlsx'
import nodemailer from 'nodemailer'
import mjml from 'mjml'
import type { VercelRequest, VercelResponse } from '@vercel/node'
import { getDb } from './_db.js'
import { requireAuth } from './_auth.js'

// ── Schemas ───────────────────────────────────────────────────────────────────

const BodySchema = z.object({
  year:       z.number().int().min(2000).max(2100),
  month:      z.number().int().min(1).max(12),
  recipients: z.array(z.string().email()).min(1).optional(),
})

const EntryDocSchema = z.object({
  employeeId: z.string(),
  type: z.enum(['present', 'absent', 'vacation', 'sick']),
  hours: z.number(),
  sickRef: z.string().nullable(),
})

const EmployeeDocSchema = z.object({
  _id: z.union([z.string(), z.any()]).transform(v => (typeof v === 'string' ? v : String(v))),
  name: z.string(),
  isAdmin: z.boolean(),
  email: z.string().nullable().optional(),
})

// ── Types ─────────────────────────────────────────────────────────────────────

type EntryDoc = z.infer<typeof EntryDocSchema>
type EmployeeDoc = z.infer<typeof EmployeeDocSchema>

// ── Helpers ───────────────────────────────────────────────────────────────────

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

function empId(emp: EmployeeDoc): string {
  return emp._id
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function computeSummary(entries: EntryDoc[]) {
  let hoursWorked = 0, absentHours = 0, vacationDays = 0, sickDays = 0, tickets = 0
  for (const e of entries) {
    // hoursWorked includes both present and absent hours (matches frontend computeSummary)
    if (e.type === 'present' || e.type === 'absent') hoursWorked += e.hours
    if (e.type === 'absent')   absentHours += e.hours
    if (e.type === 'vacation') vacationDays++
    if (e.type === 'sick')     sickDays++
    if (e.type === 'present')  tickets++
  }
  return { hoursWorked, absentHours, vacationDays, sickDays, tickets }
}

function isLastDayOfMonth(date: Date): boolean {
  // Check by seeing if tomorrow is day 1
  const tomorrow = new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1)
  return tomorrow.getDate() === 1
}

function buildXlsxBuffer(
  employees: EmployeeDoc[],
  entriesByEmployee: Map<string, EntryDoc[]>
): Buffer {
  const headers = ['Employee', 'Hours Worked', 'Absent Hours', 'Vacation Days', 'Sick Days', 'Sick Refs', 'Tickets']
  const rows = employees.map(emp => {
    const empEntries = entriesByEmployee.get(empId(emp)) ?? []
    if (empEntries.length === 0) return [emp.name, 0, 0, 0, 0, '', 0]
    const s = computeSummary(empEntries)
    const sickRefs = empEntries
      .filter((e): e is EntryDoc & { sickRef: string } =>
        e.type === 'sick' && e.sickRef != null && e.sickRef.trim() !== ''
      )
      .map(e => e.sickRef)
      .join(', ')
    return [emp.name, s.hoursWorked, s.absentHours, s.vacationDays, s.sickDays, sickRefs, s.tickets]
  })
  const ws = XLSX.utils.aoa_to_sheet([headers, ...rows])
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Summary')
  return Buffer.from(XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Uint8Array)
}

function buildMjmlHtml(
  employees: EmployeeDoc[],
  entriesByEmployee: Map<string, EntryDoc[]>,
  month: number,
  year: number
): string {
  const monthName = MONTH_NAMES[month - 1]
  const safeAppUrl = (process.env.APP_URL ?? '').replace(/"/g, '%22')

  const logoHtml = safeAppUrl
    ? `<mj-image width="120px" src="${safeAppUrl}/LOGO-VCS-variante_colore2.png" align="left" padding="0" />`
    : `<mj-text color="#ffffff" font-size="18px" font-weight="bold" padding="0">VCS</mj-text>`

  const rows = employees.map((emp, i) => {
    const bg = i % 2 === 0 ? '#ffffff' : '#fafafa'
    const empEntries = entriesByEmployee.get(empId(emp)) ?? []
    if (empEntries.length === 0) {
      return `<tr style="background-color:${bg}">
        <td style="padding:8px 10px;border-bottom:1px solid #eeeeee;font-weight:500">${escapeHtml(emp.name)}</td>
        <td colspan="5" style="padding:8px 10px;border-bottom:1px solid #eeeeee;color:#999999">No entries</td>
      </tr>`
    }
    const s = computeSummary(empEntries)
    const fmtAbsent = s.absentHours > 0
      ? `<span style="color:#e67e22;font-weight:bold">${s.absentHours}h</span>`
      : `<span style="color:#999999">&#8212;</span>`
    const fmtVacation = s.vacationDays > 0
      ? `${s.vacationDays}`
      : `<span style="color:#999999">&#8212;</span>`
    const fmtSick = s.sickDays > 0
      ? `<span style="color:#e74c3c;font-weight:bold">${s.sickDays}</span>`
      : `<span style="color:#999999">&#8212;</span>`
    return `<tr style="background-color:${bg}">
      <td style="padding:8px 10px;border-bottom:1px solid #eeeeee;font-weight:500">${escapeHtml(emp.name)}</td>
      <td style="padding:8px 10px;border-bottom:1px solid #eeeeee;text-align:right">${s.hoursWorked}h</td>
      <td style="padding:8px 10px;border-bottom:1px solid #eeeeee;text-align:right">${fmtAbsent}</td>
      <td style="padding:8px 10px;border-bottom:1px solid #eeeeee;text-align:right">${fmtVacation}</td>
      <td style="padding:8px 10px;border-bottom:1px solid #eeeeee;text-align:right">${fmtSick}</td>
      <td style="padding:8px 10px;border-bottom:1px solid #eeeeee;text-align:right">${s.tickets}</td>
    </tr>`
  }).join('\n')

  const thStyle = 'padding:8px 10px;border-bottom:2px solid #1e3a5f;color:#666666;font-size:11px;text-transform:uppercase;font-weight:600'

  const template = `
<mjml>
  <mj-head>
    <mj-attributes>
      <mj-all font-family="Arial, Helvetica, sans-serif" />
    </mj-attributes>
  </mj-head>
  <mj-body background-color="#f4f4f4">

    <mj-section background-color="#1e3a5f" padding="16px 24px">
      <mj-column vertical-align="middle">
        ${logoHtml}
      </mj-column>
      <mj-column vertical-align="middle">
        <mj-text align="right" color="#ffffff" font-size="16px" font-weight="bold" padding="0">
          ${monthName} ${year}
        </mj-text>
        <mj-text align="right" color="rgba(255,255,255,0.65)" font-size="11px" padding="4px 0 0 0">
          Monthly Report
        </mj-text>
      </mj-column>
    </mj-section>

    <mj-section background-color="#ffffff" padding="0">
      <mj-column padding="0">
        <mj-table font-size="13px" color="#111111">
          <tr style="background-color:#f0f4f8">
            <th style="${thStyle};text-align:left">Employee</th>
            <th style="${thStyle};text-align:right">Hours</th>
            <th style="${thStyle};text-align:right">Absent</th>
            <th style="${thStyle};text-align:right">Vacation</th>
            <th style="${thStyle};text-align:right">Sick</th>
            <th style="${thStyle};text-align:right">Tickets</th>
          </tr>
          ${rows}
        </mj-table>
      </mj-column>
    </mj-section>

    <mj-section background-color="#f5f7fa" padding="10px 24px">
      <mj-column>
        <mj-text font-size="11px" color="#aaaaaa" align="center" padding="8px 0">
          Excel report attached &#xB7; Sent automatically
        </mj-text>
      </mj-column>
    </mj-section>

  </mj-body>
</mjml>`

  const result = mjml(template, { validationLevel: 'soft' })
  if (result.errors.length > 0) {
    console.error('[send-summary] MJML warnings:', result.errors)
  }
  return result.html
}

// ── Core send logic ───────────────────────────────────────────────────────────

async function sendSummary(year: number, month: number, res: VercelResponse, explicitRecipients?: string[]): Promise<void> {
  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM } = process.env
  if (!SMTP_HOST || !SMTP_PORT || !SMTP_USER || !SMTP_PASS || !SMTP_FROM) {
    res.status(500).json({ error: 'SMTP environment variables not configured' })
    return
  }

  const db = await getDb()
  const monthStr = String(month).padStart(2, '0')

  const [rawEntries, rawEmployees] = await Promise.all([
    db.collection('attendance_entries')
      .find({ date: { $regex: `^${year}-${monthStr}` } })
      .toArray(),
    db.collection('employees')
      .find({})
      .toArray(),
  ])

  const entryDocs = z.array(EntryDocSchema).parse(rawEntries)
  const employeeDocs = z.array(EmployeeDocSchema).parse(rawEmployees)

  const entriesByEmployee = new Map<string, EntryDoc[]>()
  for (const e of entryDocs) {
    const key = e.employeeId
    if (!entriesByEmployee.has(key)) entriesByEmployee.set(key, [])
    entriesByEmployee.get(key)!.push(e)
  }

  const recipients = explicitRecipients ?? employeeDocs
    .filter((e): e is EmployeeDoc & { email: string } => e.isAdmin && e.email != null && e.email.length > 0)
    .map(e => e.email)

  if (recipients.length === 0) {
    res.json({ sent: 0 })
    return
  }

  const xlsxBuffer = buildXlsxBuffer(employeeDocs, entriesByEmployee)
  const html = buildMjmlHtml(employeeDocs, entriesByEmployee, month, year)
  const monthName = MONTH_NAMES[month - 1]

  const transporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port: Number(SMTP_PORT),
    secure: Number(SMTP_PORT) === 465,
    auth: { user: SMTP_USER, pass: SMTP_PASS },
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
  })

  await transporter.sendMail({
    from: SMTP_FROM,
    to: recipients,
    subject: `Attendance Summary — ${monthName} ${year}`,
    html,
    attachments: [{
      filename: `summary-${year}-${monthStr}.xlsx`,
      content: xlsxBuffer,
      contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    }],
  })

  res.json({ sent: recipients.length })
}

// ── Handler ───────────────────────────────────────────────────────────────────

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  const isCron = req.headers['x-vercel-cron'] === '1'

  // Cron or GET: only send on the last day of the month
  if (req.method === 'GET' || isCron) {
    const today = new Date()
    if (!isLastDayOfMonth(today)) {
      res.json({ sent: 0, reason: 'not-last-day' })
      return
    }
    try {
      await sendSummary(today.getFullYear(), today.getMonth() + 1, res)
    } catch {
      res.status(500).json({ error: 'Failed to send summary email' })
    }
    return
  }

  // Manual POST: require admin auth
  if (req.method === 'POST') {
    const auth = await requireAuth(req, res)
    if (!auth) return
    if (!auth.isAdmin) { res.status(403).json({ error: 'Admin access required' }); return }

    const parsed = BodySchema.safeParse(req.body)
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0].message })
      return
    }
    try {
      await sendSummary(parsed.data.year, parsed.data.month, res, parsed.data.recipients)
    } catch {
      res.status(500).json({ error: 'Failed to send summary email' })
    }
    return
  }

  res.status(405).json({ error: 'Method not allowed' })
}
