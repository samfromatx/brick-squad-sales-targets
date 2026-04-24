import { useQuery } from '@tanstack/react-query'
import { api } from '../../lib/api'

export function useTrendSearch(q: string) {
  return useQuery({
    queryKey: ['trends-search', q],
    queryFn: () => api.searchTrends(q),
    enabled: q.length >= 2,
    staleTime: 30_000,
  })
}

export function useTrendDetail(card: string, sport?: string) {
  return useQuery({
    queryKey: ['trends-detail', card, sport],
    queryFn: () => api.getTrendDetail(card, sport),
    enabled: card.length > 0,
    staleTime: 30_000,
  })
}
