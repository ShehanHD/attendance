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
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Employee</TableHead>
          <TableHead className='text-right'>Hours Worked</TableHead>
          <TableHead className='text-right'>Vacation Days</TableHead>
          <TableHead className='text-right'>Sick Days</TableHead>
          <TableHead className='text-right'>Tickets</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {employees.map(emp => {
          const empEntries = allEntries.filter(e => e.employeeId === emp._id)
          const s = computeSummary(empEntries)
          return (
            <TableRow key={emp._id}>
              <TableCell className='font-medium'>{emp.name}</TableCell>
              <TableCell className='text-right'>{s.hoursWorked}h</TableCell>
              <TableCell className='text-right'>{s.vacationDays}</TableCell>
              <TableCell className='text-right'>{s.sickDays}</TableCell>
              <TableCell className='text-right'>{s.tickets}</TableCell>
            </TableRow>
          )
        })}
      </TableBody>
    </Table>
  )
}
