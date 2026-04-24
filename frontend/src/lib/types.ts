export type Sport = 'football' | 'basketball'
export type Category = 'graded' | 'raw' | 'bounce_back'

export interface RawMetrics {
  target_raw: number | null
  max_raw: number | null
  est_psa9: number | null
  est_psa10: number | null
  gem_rate: number | null
  roi: number | null
}

export interface BounceBackMetrics {
  score: number | null
  s1_cheap: boolean
  s2_stable: boolean
  s3_not_priced_in: boolean
  s4_volume: boolean
  s5_no_spike: boolean
}

export interface Target {
  id: string
  sport: Sport
  category: Category
  rank: number
  card_name: string
  grade: string | null
  target_price: number | null
  max_price: number | null
  trend_pct: number | null
  volume_count: number | null
  volume_window_days: number | null
  sell_at: number | null
  rationale: string | null
  is_new: boolean
  last_updated: string | null
  raw_metrics: RawMetrics | null
  bounce_back_metrics: BounceBackMetrics | null
}

export interface PortfolioAllocationItem {
  card_name: string
  budget: number
  thesis: string | null
  card_type: string | null
  cost_each: number | null
  qty: number | null
  subtotal: number | null
}

export interface PortfolioAllocation {
  tier: string
  description: string | null
  total: number | null
  allocations: PortfolioAllocationItem[]
}

export interface EbaySearch {
  id: string | null
  sport: Sport
  category: Category
  rank: number | null
  card_name: string | null
  search_text: string
}

export interface PortfolioEntry {
  id: string
  user_id: string
  card_name: string
  sport: string
  grade: string
  price_paid: number
  grading_cost: number
  target_sell: number | null
  actual_sale: number | null
  sale_venue: string | null
  purchase_date: string | null
  notes: string | null
  pc: boolean
}

export interface PortfolioEntryCreate {
  card_name: string
  sport: string
  grade: string
  price_paid: number
  grading_cost?: number
  target_sell?: number | null
  actual_sale?: number | null
  sale_venue?: string | null
  purchase_date?: string | null
  notes?: string | null
  pc?: boolean
}

export interface PortfolioEntryUpdate {
  card_name?: string
  sport?: string
  grade?: string
  price_paid?: number
  grading_cost?: number
  target_sell?: number | null
  actual_sale?: number | null
  sale_venue?: string | null
  purchase_date?: string | null
  notes?: string | null
  pc?: boolean
}

export interface ExportSnapshot {
  schema_version: string
  generated_at: string
  last_updated: string | null
  user: { id: string; email: string | null }
  data: {
    targets: Target[]
    portfolio_allocations: PortfolioAllocation[]
    ebay_searches: EbaySearch[]
    portfolio_entries: PortfolioEntry[]
  }
}

export interface PaginatedResponse<T> {
  data: T[]
  next_cursor: string | null
  has_more: boolean
}

export interface ApiError {
  error: {
    code: string
    message: string
    details?: Record<string, unknown>
    request_id: string
  }
}
