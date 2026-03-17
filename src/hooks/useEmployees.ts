import { useQuery } from '@tanstack/react-query'
import { fetchEmployees } from '@/lib/mongoApi'

export function useEmployees() {
  return useQuery({
    queryKey: ['employees'],
    queryFn: fetchEmployees,
  })
}
