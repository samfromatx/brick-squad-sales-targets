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
  vol: string | null
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

// ── Trend analysis types (T-11) ────────────────────────────────────────────

export interface TrendSearchResult {
  card: string
  sport: Sport
}

export interface AnchorObject {
  grade: string
  anchor_value: number
  anchor_window: number
  anchor_sales_count: number
  anchor_source: string
}

export interface TrendHealth {
  direction: string
  ratio: number | null
  source_grade: string | null
  source_window: string | null
}

export interface VolumeSignal {
  signal: 'Accelerating' | 'Stable' | 'Declining'
  change_pct: number | null
}

export interface LiquiditySignal {
  label: 'Very thin' | 'Thin' | 'Moderate' | 'Liquid'
  total_90d_sales: number
}

export interface VolatilitySignal {
  label: string
  ratio: number | null
}

export interface MarketHealth {
  trend: TrendHealth
  volume: VolumeSignal
  liquidity: LiquiditySignal
  volatility: VolatilitySignal
}

export interface EvModel {
  raw_anchor: number
  grading_cost: number
  total_cost: number
  psa9_anchor: number
  psa10_anchor: number
  gem_rate: number
  gem_rate_source: string
  estimated_outcomes: {
    psa10: number
    psa9: number
    psa8_or_lower: number
  }
  expected_resale_after_fees: number
  expected_profit: number
  profit_floor: number
}

export interface BuyTarget {
  grade: string
  price: number
  basis: string
  warning: string | null
}

export interface AnalysisWarning {
  code: string
  severity: 'low' | 'medium' | 'high'
  message: string
}

export interface BounceBackSignals {
  b1_cheap: boolean
  b2_recent_liquidity: boolean
  b3_stabilizing: boolean
  b4_recovery_not_priced: boolean
  b5_market_active: boolean
  b6_no_spike: boolean
  score: number
  qualifies: boolean
}

export interface TrendAnalysisResponse {
  verdict: string
  market_confidence: string
  primary_reason: string
  buy_target: BuyTarget | null
  market_health: MarketHealth
  ev_model: EvModel | null
  break_even_grade: string | null
  warnings: AnalysisWarning[]
  bounce_back: BounceBackSignals | null
}
