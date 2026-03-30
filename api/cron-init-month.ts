import { ObjectId } from 'mongodb'
import type { VercelRequest, VercelResponse } from '@vercel/node'
import { getDb } from './_db.js'

// Duplicated from src/lib/attendanceUtils.ts — api/ has a separate tsconfig
// that excludes src/, so cross-directory imports are not possible.

// Fixed Italian national holidays + Milan patron saint (month 1-indexed).
const ITALIAN_PUBLIC_HOLIDAYS: { month: number; day: number }[] = [
  { month: 1,  day: 1  }, // Capodanno
  { month: 1,  day: 6  }, // Epifania
  { month: 4,  day: 25 }, // Festa della Liberazione
  { month: 5,  day: 1  }, // Festa dei Lavoratori
  { month: 6,  day: 2  }, // Festa della Repubblica
  { month: 8,  day: 15 }, // Ferragosto
  { month: 11, day: 1  }, // Ognissanti
  { month: 12, day: 7  }, // Sant'Ambrogio (Milan)
  { month: 12, day: 8  }, // Immacolata Concezione
  { month: 12, day: 25 }, // Natale
  { month: 12, day: 26 }, // Santo Stefano
]

// Easter Monday date for the given year (Anonymous Gregorian algorithm).
function getEasterMonday(year: number): { month: number; day: number } {
  const a = year % 19
  const b = Math.floor(year / 100)
  const c = year % 100
  const d = Math.floor(b / 4)
  const e = b % 4
  const f = Math.floor((b + 8) / 25)
  const g = Math.floor((b - f + 1) / 3)
  const h = (19 * a + b - d - g + 15) % 30
  const i = Math.floor(c / 4)
  const k = c % 4
  const l = (32 + 2 * e + 2 * i - h - k) % 7
  const m = Math.floor((a + 11 * h + 22 * l) / 451)
  const easterMonth = Math.floor((h + l - 7 * m + 114) / 31)
  const easterDay = ((h + l - 7 * m + 114) % 31) + 1
  const easter = new Date(year, easterMonth - 1, easterDay)
  const monday = new Date(easter.getFullYear(), easter.getMonth(), easter.getDate() + 1)
  return { month: monday.getMonth() + 1, day: monday.getDate() }
}

function isDisabledDay(year: number, month: number, day: number): boolean {
  const dow = new Date(year, month - 1, day).getDay() // 0=Sun, 6=Sat
  if (dow === 0 || dow === 6) return true
  if (ITALIAN_PUBLIC_HOLIDAYS.some(h => h.month === month && h.day === day)) return true
  const em = getEasterMonday(year)
  if (em.month === month && em.day === day) return true
  return false
}

interface ClosureRange {
  date: string
  endDate?: string
}

function isCompanyClosure(year: number, month: number, day: number, closures: ClosureRange[]): boolean {
  const iso = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
  return closures.some(c => iso >= c.date && iso <= (c.endDate ?? c.date))
}

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' })
    return
  }

  const secret = process.env.CRON_SECRET
  if (!secret || req.headers['authorization'] !== `Bearer ${secret}`) {
    res.status(401).json({ error: 'Unauthorized' })
    return
  }

  const now = new Date()
  const year = now.getUTCFullYear()
  const month = now.getUTCMonth() + 1
  const monthStart = `${year}-${String(month).padStart(2, '0')}-01`
  const nextMonthStart = month === 12
    ? `${year + 1}-01-01`
    : `${year}-${String(month + 1).padStart(2, '0')}-01`

  try {
    const db = await getDb()

    const employees = await db
      .collection('employees')
      .find({ isActive: { $ne: false } })
      .toArray() as Array<{ _id: { toString(): string }; standardHours?: unknown }>

    const closures = (await db
        .collection('closures')
        .find({
          date: { $lt: nextMonthStart },
          $or: [
            { endDate: { $gte: monthStart } },
            { endDate: { $exists: false } },
          ],
        })
        .toArray()).map(doc => ({
      date: doc['date'] as string,
      ...(doc['endDate'] !== undefined && { endDate: doc['endDate'] as string }),
    })) satisfies ClosureRange[]

    // Fetch all employee IDs with existing attendance entries for this month in a single query.
    const existingIds = await db
      .collection('attendance_entries')
      .distinct('employeeId', { date: { $gte: monthStart, $lt: nextMonthStart } })
    const existingSet = new Set(existingIds)

    let initialized = 0
    let skipped = 0
    const daysInMonth = new Date(year, month, 0).getDate()

    for (const emp of employees) {
      const employeeId = emp._id.toString()

      if (existingSet.has(employeeId)) {
        skipped++
        continue
      }

      const hours = typeof emp.standardHours === 'number' ? emp.standardHours : 8
      const docs = []
      for (let day = 1; day <= daysInMonth; day++) {
        if (isDisabledDay(year, month, day)) continue
        const iso = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
        const isClosure = isCompanyClosure(year, month, day, closures)
        docs.push({
          _id: new ObjectId(),
          employeeId,
          date: iso,
          type: isClosure ? 'vacation' : 'present',
          hours: isClosure ? 0 : hours,
          sickRef: null,
        })
      }

      if (docs.length > 0) {
        await db.collection('attendance_entries').insertMany(docs)
      }
      initialized++
    }

    res.status(200).json({ initialized, skipped })
  } catch (err) {
    console.error('[cron-init-month] Error:', err)
    res.status(500).json({ error: 'Internal server error' })
  }
}
