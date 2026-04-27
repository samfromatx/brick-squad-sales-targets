import { useQuery } from '@tanstack/react-query'
import { api } from '../../lib/api'
import type { CardMarketDataResult, PortfolioEntry } from '../../lib/types'

export function marketDataKey(entryIds: string[]): readonly [string, string] {
  const sorted = [...entryIds].sort()
  return ['market-data-batch', sorted.join(',')] as const
}

export function useMarketData(entries: PortfolioEntry[]) {
  const eligible = entries.filter(e => !(e.actual_sale !== null && e.actual_sale > 0) && !e.pc)
  const ids = eligible.map(e => e.id)

  const query = useQuery({
    queryKey: marketDataKey(ids),
    queryFn: () =>
      api.batchMarketData(
        eligible.map(e => ({ id: e.id, card: e.card_name, grade: e.grade })),
      ),
    enabled: eligible.length > 0,
    staleTime: 5 * 60 * 1000,
  })

  const marketDataMap = new Map<string, CardMarketDataResult>()
  for (const r of query.data?.results ?? []) {
    marketDataMap.set(r.id, r)
  }

  return { marketDataMap, isLoading: query.isLoading, isError: query.isError, error: query.error }
}
