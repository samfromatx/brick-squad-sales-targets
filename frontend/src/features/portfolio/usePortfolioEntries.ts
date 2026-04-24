import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '../../lib/api'
import type { PortfolioEntryCreate, PortfolioEntryUpdate } from '../../lib/types'

export const ENTRIES_KEY = ['portfolio-entries'] as const
export const ALLOCATIONS_KEY = ['portfolio-allocations'] as const

export function usePortfolioEntries() {
  return useQuery({
    queryKey: ENTRIES_KEY,
    queryFn: () => api.getAllPortfolioEntries(),
  })
}

export function usePortfolioAllocations() {
  return useQuery({
    queryKey: ALLOCATIONS_KEY,
    queryFn: () => api.getPortfolios(),
  })
}

export function useCreateEntry() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: PortfolioEntryCreate) => api.createPortfolioEntry(data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ENTRIES_KEY }),
  })
}

export function useUpdateEntry() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: PortfolioEntryUpdate }) =>
      api.updatePortfolioEntry(id, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ENTRIES_KEY }),
  })
}

export function useDeleteEntry() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => api.deletePortfolioEntry(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ENTRIES_KEY }),
  })
}
