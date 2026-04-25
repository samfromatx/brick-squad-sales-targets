import { useQuery } from '@tanstack/react-query'
import { api } from '../../lib/api'
import type { Sport } from '../../lib/types'

export function useTrendSearch(q: string, sport: Sport) {
  return useQuery({
    queryKey: ['trends-search', q, sport],
    queryFn: () => api.searchCards(q, sport),
    enabled: q.length >= 2,
    staleTime: 30_000,
  })
}

export function useTrendAnalysis(card: string, sport: Sport) {
  return useQuery({
    queryKey: ['trends-analysis', card, sport],
    queryFn: () => api.getTrendAnalysis(card, sport),
    enabled: card.length > 0 && sport.length > 0,
    staleTime: 30_000,
    retry: false,
  })
}
