import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { fetchClosures, createClosure, deleteClosure } from '@/lib/mongoApi'

export function useClosures() {
  return useQuery({
    queryKey: ['closures'],
    queryFn: fetchClosures,
  })
}

export function useCreateClosure() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: createClosure,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['closures'] }),
  })
}

export function useDeleteClosure() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: deleteClosure,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['closures'] }),
  })
}
