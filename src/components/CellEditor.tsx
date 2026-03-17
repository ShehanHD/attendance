import { useState, useEffect } from 'react'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import type { AttendanceEntry, AttendanceEntryType } from '@/lib/schemas'

interface Props {
  entry: AttendanceEntry
  onSave: (updated: AttendanceEntry) => void
  children: React.ReactNode  // trigger element
}

const ENTRY_TYPE_LABELS: Record<AttendanceEntryType, string> = {
  present: 'Present',
  absent: 'Absent',
  vacation: 'Vacation',
  sick: 'Sick',
}

export default function CellEditor({ entry, onSave, children }: Props) {
  const [open, setOpen] = useState(false)
  const [type, setType] = useState<AttendanceEntryType>(entry.type)
  const [hours, setHours] = useState(String(entry.hours))
  const [sickRef, setSickRef] = useState(entry.sickRef ?? '')

  // Reset local state when the entry prop changes (e.g. month change)
  useEffect(() => {
    setType(entry.type)
    setHours(String(entry.hours))
    setSickRef(entry.sickRef ?? '')
  }, [entry])

  const showHours = type !== 'vacation' && type !== 'sick'
  const showSickRef = type === 'sick'

  const handleSave = () => {
    onSave({
      ...entry,
      type,
      hours: showHours ? Number(hours) : 0,
      sickRef: showSickRef ? sickRef.trim() || null : null,
    })
    setOpen(false)
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>{children}</PopoverTrigger>
      <PopoverContent className='w-56 space-y-3'>
        <div className='space-y-1'>
          <Label>Type</Label>
          <Select
            value={type}
            onValueChange={v => setType(v as AttendanceEntryType)}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(Object.keys(ENTRY_TYPE_LABELS) as AttendanceEntryType[]).map(t => (
                <SelectItem key={t} value={t}>
                  {ENTRY_TYPE_LABELS[t]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {showHours && (
          <div className='space-y-1'>
            <Label>Hours</Label>
            <Input
              type='number'
              min={0}
              max={24}
              step={0.5}
              value={hours}
              onChange={e => setHours(e.target.value)}
            />
          </div>
        )}

        {showSickRef && (
          <div className='space-y-1'>
            <Label>Sick reference</Label>
            <Input
              value={sickRef}
              onChange={e => setSickRef(e.target.value)}
              placeholder='e.g. DR-001'
            />
          </div>
        )}

        <Button size='sm' className='w-full' onClick={handleSave}>
          Apply
        </Button>
      </PopoverContent>
    </Popover>
  )
}
