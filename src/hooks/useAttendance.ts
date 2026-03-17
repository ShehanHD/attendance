import { useQuery, useQueryClient } from '@tanstack/react-query'
import { fetchEntries, saveEntries } from '@/lib/mongoApi'
import type { AttendanceEntry } from '@/lib/schemas'

export function useAttendanceEntries(
  employeeId: string | null,
  year: number,
  month: number
) {
  return useQuery({
    queryKey: ['attendance', employeeId, year, month],
    queryFn: () => fetchEntries(employeeId!, year, month),
    enabled: employeeId !== null,
  })
}

export function useSaveAttendance() {
  const queryClient = useQueryClient()

  return async (
    employeeId: string,
    year: number,
    month: number,
    entries: AttendanceEntry[]
  ): Promise<AttendanceEntry[]> => {
    await saveEntries(employeeId, year, month, entries)
    // Invalidate and refetch to get server-assigned _ids
    await queryClient.invalidateQueries({
      queryKey: ['attendance', employeeId, year, month],
    })
    const fresh = await queryClient.fetchQuery({
      queryKey: ['attendance', employeeId, year, month],
      queryFn: () => fetchEntries(employeeId, year, month),
    })
    return fresh
  }
}
