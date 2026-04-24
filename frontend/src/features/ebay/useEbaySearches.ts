import { useQuery } from '@tanstack/react-query'
import { api } from '../../lib/api'

export const EBAY_KEY = ['ebay-searches'] as const

export function useEbaySearches() {
  return useQuery({
    queryKey: EBAY_KEY,
    queryFn: () => api.getEbaySearches(),
  })
}
