import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { computeSummary } from '@/lib/attendanceUtils'
import type { AttendanceEntry, Employee } from '@/lib/schemas'

interface Props {
  employees: Employee[]
  allEntries: AttendanceEntry[]
}

export default function SummaryTable({ employees, allEntries }: Props) {
  if (allEntries.length === 0) {
    return (
      <p className='text-muted-foreground text-sm py-6 text-center'>
        No attendance data for this month.
      </p>
    )
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Employee</TableHead>
          <TableHead className='text-right'>Hours Worked</TableHead>
          <TableHead className='text-right'>Vacation Days</TableHead>
          <TableHead className='text-right'>Sick Days</TableHead>
          <TableHead>Sick Refs</TableHead>
          <TableHead className='text-right'>Tickets</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {employees.map(emp => {
          const empEntries = allEntries.filter(e => e.employeeId === emp._id)

          if (empEntries.length === 0) {
            return (
              <TableRow key={emp._id}>
                <TableCell className='font-medium'>{emp.name}</TableCell>
                <TableCell colSpan={5} className='text-muted-foreground text-sm'>
                  No entries for this month
                </TableCell>
              </TableRow>
            )
          }

          const s = computeSummary(empEntries)
          const sickRefs = empEntries
            .filter(e => e.type === 'sick' && e.sickRef && e.sickRef.trim() !== '')
            .map(e => e.sickRef as string)

          return (
            <TableRow key={emp._id}>
              <TableCell className='font-medium'>{emp.name}</TableCell>
              <TableCell className='text-right'>{s.hoursWorked}h</TableCell>
              <TableCell className='text-right'>{s.vacationDays}</TableCell>
              <TableCell className='text-right'>{s.sickDays}</TableCell>
              <TableCell>
                {s.sickDays > 0 ? (
                  sickRefs.length > 0 ? (
                    <div className='flex flex-col gap-0.5'>
                      {sickRefs.map((ref, i) => (
                        <span
                          key={i}
                          className='inline-block w-fit rounded-md bg-red-50 px-2 py-0.5 text-xs font-medium text-red-700'
                        >
                          {ref}
                        </span>
                      ))}
                    </div>
                  ) : (
                    <span className='text-xs text-orange-600 font-medium'>Missing refs</span>
                  )
                ) : (
                  <span className='text-muted-foreground text-xs'>—</span>
                )}
              </TableCell>
              <TableCell className='text-right'>{s.tickets}</TableCell>
            </TableRow>
          )
        })}
      </TableBody>
    </Table>
  )
}
