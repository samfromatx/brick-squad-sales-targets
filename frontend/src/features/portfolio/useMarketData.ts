import { useQuery } from '@tanstack/react-query'
import { api } from '../../lib/api'
import type { CardMarketDataResult, PortfolioEntry } from '../../lib/types'

export function useMarketData(entries: PortfolioEntry[]) {
  const eligible = entries.filter(e => !(e.actual_sale !== null && e.actual_sale > 0))
  const ids = eligible.map(e => e.id)
  const sortedKey = [...ids].sort().join(',')

  const query = useQuery({
    queryKey: ['market-data-batch', sortedKey],
    queryFn: () =>
      api.batchMarketData(
        eligible.map(e => ({ id: e.id, card: e.card_name, grade: e.grade })),
      ),
    enabled: eligible.length > 0,
    staleTime: 24 * 60 * 60 * 1000,
    gcTime: 24 * 60 * 60 * 1000,
    retry: false,
  })

  const marketDataMap = new Map<string, CardMarketDataResult>()
  for (const r of query.data?.results ?? []) {
    marketDataMap.set(r.id, r)
  }

  return { marketDataMap, isLoading: query.isLoading, isError: query.isError, error: query.error }
}
