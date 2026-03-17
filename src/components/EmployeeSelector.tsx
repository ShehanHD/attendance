import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Label } from '@/components/ui/label'
import type { Employee } from '@/lib/schemas'

interface Props {
  employees: Employee[]
  value: string | null
  onChange: (employeeId: string) => void
}

export default function EmployeeSelector({ employees, value, onChange }: Props) {
  return (
    <div className='flex flex-col gap-2'>
      <Label htmlFor='employee-select'>Select your name</Label>
      <Select value={value ?? ''} onValueChange={onChange}>
        <SelectTrigger id='employee-select' className='w-64'>
          <SelectValue placeholder='Choose employee…' />
        </SelectTrigger>
        <SelectContent>
          {employees.map(emp => (
            <SelectItem key={emp._id} value={emp._id}>
              {emp.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}
