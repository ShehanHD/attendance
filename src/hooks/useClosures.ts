import { useQuery } from '@tanstack/react-query'
import { fetchClosures } from '@/lib/mongoApi'

export function useClosures() {
  return useQuery({
    queryKey: ['closures'],
    queryFn: fetchClosures,
  })
}
