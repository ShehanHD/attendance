import { useState, useMemo } from 'react'
import { Download, Mail, ArrowLeft } from 'lucide-react'
import { Navigate, useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { useQuery } from '@tanstack/react-query'
import { useEmployees } from '@/hooks/useEmployees'
import { useAuth } from '@/contexts/AuthContext'
import SummaryTable from '@/components/SummaryTable'
import { fetchAllEntriesForMonth } from '@/lib/mongoApi'
import { exportSummaryToExcel } from '@/lib/exportUtils'

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

export default function Summary() {
  const { user } = useAuth()
  const navigate = useNavigate()

  const now = new Date()
  const currentYear = now.getFullYear()
  const YEARS = [currentYear - 1, currentYear, currentYear + 1]

  const [month, setMonth] = useState(now.getMonth() + 1)
  const [year, setYear] = useState(currentYear)
  const [isSending, setIsSending] = useState(false)
  const [sendDialogOpen, setSendDialogOpen] = useState(false)
  const [recipientInput, setRecipientInput] = useState('')
  const [copyToMe, setCopyToMe] = useState(false)

  const { data: employees, isLoading: empLoading, isError: empError } = useEmployees()

  const {
    data: allEntries,
    isLoading: entriesLoading,
    isError: entriesError,
    refetch,
  } = useQuery({
    queryKey: ['summary-entries', year, month],
    queryFn: () => fetchAllEntriesForMonth(year, month),
    enabled: user !== null && user.isAdmin === true,
  })

  // Employees active during the selected month — must be before route guard (Rules of Hooks)
  const visibleEmployees = useMemo(() => {
    const firstDay = `${year}-${String(month).padStart(2, '0')}-01`
    const lastDay = new Date(year, month, 0).toISOString().slice(0, 10)
    return (employees ?? []).filter(emp => {
      if (emp.createdAt > lastDay) return false
      if (emp.deactivatedAt && emp.deactivatedAt < firstDay) return false
      return true
    })
  }, [employees, year, month])

  // Route guards — AFTER all hooks
  if (!user || !user.isAdmin) return <Navigate to='/' replace />

  const isLoading = empLoading || entriesLoading
  const isError = empError || entriesError

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

  function parseRecipients(): string[] {
    const lines = recipientInput.split(/[\n,]+/).map(s => s.trim()).filter(Boolean)
    if (copyToMe && user!.email) {
      const lower = user!.email.toLowerCase()
      if (!lines.map(e => e.toLowerCase()).includes(lower)) lines.push(user!.email)
    }
    return [...new Set(lines)]
  }

  function recipientsValid(): boolean {
    const list = parseRecipients()
    return list.length > 0 && list.every(e => emailRegex.test(e))
  }

  async function handleSendEmail() {
    const recipients = parseRecipients()
    setSendDialogOpen(false)
    setIsSending(true)
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 30_000)
    try {
      const res = await fetch('/api/send-summary', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ year, month, recipients }),
        signal: controller.signal,
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({})) as { error?: string }
        toast.error(data.error ?? 'Failed to send summary email')
        return
      }
      const data = await res.json() as { sent: number }
      toast.success(`Summary email sent to ${data.sent} recipient${data.sent !== 1 ? 's' : ''}`)
    } catch {
      toast.error('Failed to send summary email')
    } finally {
      clearTimeout(timeoutId)
      setIsSending(false)
    }
  }

  if (isLoading) {
    return (
      <div className='flex min-h-screen items-center justify-center'>
        <p className='text-muted-foreground'>Loading…</p>
      </div>
    )
  }

  if (isError) {
    return (
      <div className='flex min-h-screen items-center justify-center p-8'>
        <Alert variant='destructive' className='max-w-md'>
          <AlertDescription>
            Failed to load summary data.{' '}
            <button onClick={() => refetch()} className='underline'>Retry</button>
          </AlertDescription>
        </Alert>
      </div>
    )
  }

  return (
    <div className='min-h-screen bg-background'>
      <header className='border-b px-4 sm:px-6 py-3 sm:py-4 flex items-center justify-between gap-3'>
        <h1 className='text-lg sm:text-xl font-semibold'>Summary</h1>
        <div className='flex items-center gap-2'>
          <Button
            variant='outline'
            disabled={!allEntries || allEntries.length === 0}
            onClick={() => exportSummaryToExcel(visibleEmployees, allEntries ?? [], month, year)}
          >
            <Download className='h-4 w-4' />Download Excel
          </Button>
          <Button
            variant='outline'
            disabled={isSending}
            onClick={() => { setRecipientInput(''); setCopyToMe(false); setSendDialogOpen(true) }}
          >
            <Mail className='h-4 w-4' />{isSending ? 'Sending…' : 'Send Summary by Email'}
          </Button>
          <Button variant='outline' onClick={() => navigate('/attendance')}>
            <ArrowLeft className='h-4 w-4' />Back
          </Button>
        </div>
      </header>

      <main className='p-4 sm:p-6 space-y-4'>
        <div className='flex gap-3'>
          <Select value={String(month)} onValueChange={v => setMonth(Number(v))}>
            <SelectTrigger className='w-36'>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {MONTHS.map((name, i) => (
                <SelectItem key={i + 1} value={String(i + 1)}>{name}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={String(year)} onValueChange={v => setYear(Number(v))}>
            <SelectTrigger className='w-24'>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {YEARS.map(y => (
                <SelectItem key={y} value={String(y)}>{y}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className='overflow-x-auto rounded-lg border'>
          <SummaryTable employees={visibleEmployees} allEntries={allEntries ?? []} />
        </div>
      </main>

      <Dialog open={sendDialogOpen} onOpenChange={setSendDialogOpen}>
        <DialogContent className='max-w-sm'>
          <DialogHeader>
            <DialogTitle>Send Summary by Email</DialogTitle>
          </DialogHeader>
          <div className='space-y-4 py-1'>
            <div className='space-y-1.5'>
              <Label htmlFor='recipients'>Recipients</Label>
              <textarea
                id='recipients'
                className='w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring resize-none'
                rows={4}
                placeholder={'email@example.com\nanother@example.com'}
                value={recipientInput}
                onChange={e => setRecipientInput(e.target.value)}
              />
              <p className='text-xs text-muted-foreground'>One email per line, or comma-separated.</p>
            </div>
            {user.email && (
              <div className='flex items-center justify-between'>
                <Label htmlFor='copy-to-me' className='cursor-pointer'>Send me a copy</Label>
                <Switch id='copy-to-me' checked={copyToMe} onCheckedChange={setCopyToMe} />
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant='outline' onClick={() => setSendDialogOpen(false)}>Cancel</Button>
            <Button disabled={!recipientsValid()} onClick={handleSendEmail}>
              <Mail className='h-4 w-4' />Send
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
