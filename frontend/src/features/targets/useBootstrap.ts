import { useQuery } from '@tanstack/react-query'
import { api } from '../../lib/api'

export const BOOTSTRAP_KEY = ['bootstrap'] as const

export function useBootstrap() {
  return useQuery({
    queryKey: BOOTSTRAP_KEY,
    queryFn: () => api.getBootstrap(),
  })
}
