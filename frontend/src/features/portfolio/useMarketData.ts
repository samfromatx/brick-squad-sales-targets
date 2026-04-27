import { useMemo } from 'react'
import { useQueries } from '@tanstack/react-query'
import type { CardMarketDataResult, PortfolioEntry } from '../../lib/types'

// ─── CSV parsing ──────────────────────────────────────────────────────────────

type CsvRow = Record<string, string>

function parseCSVRow(line: string): string[] {
  const result: string[] = []
  let current = ''
  let inQuotes = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') { current += '"'; i++ }
      else inQuotes = !inQuotes
    } else if (ch === ',' && !inQuotes) {
      result.push(current.trim())
      current = ''
    } else {
      current += ch
    }
  }
  result.push(current.trim())
  return result
}

async function fetchCSV(sport: string, window: string): Promise<CsvRow[]> {
  const res = await fetch(`/data/${sport}-all-players-last-${window}-days.csv`)
  if (!res.ok) return []
  const text = await res.text()
  const lines = text.split('\n').filter(l => l.trim())
  if (lines.length < 2) return []
  const headers = parseCSVRow(lines[0])
  return lines.slice(1).map(line => {
    const vals = parseCSVRow(line)
    const obj: CsvRow = {}
    headers.forEach((h, i) => { obj[h] = vals[i] ?? '' })
    return obj
  })
}

// ─── Matching (port of old page's fuzzyFindRow) ───────────────────────────────

function normalizeName(s: string): string {
  return s.toLowerCase()
    .replace(/\/\d+/g, '')
    .replace(/#\d+/g, '')
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function fuzzyFindRow(rows: CsvRow[], card: string, grade: string): CsvRow | null {
  const gradeLower = (grade || '').toLowerCase()
  const tokens = normalizeName(card).split(' ').filter(t => t)
  const tokenSet = new Set(tokens)

  // Exact match first
  const exact = rows.find(r =>
    (r['Card'] || '').toLowerCase() === card.toLowerCase() &&
    (r['Grade'] || '').toLowerCase() === gradeLower
  )
  if (exact) return exact

  // Bidirectional token subset match with grade filter
  const candidates = rows.filter(r => {
    if ((r['Grade'] || '').toLowerCase() !== gradeLower) return false
    const csvToks = normalizeName(r['Card'] || '').split(' ').filter(t => t)
    const csvSet = new Set(csvToks)
    return tokens.every(t => csvSet.has(t)) || csvToks.every(t => tokenSet.has(t))
  })

  if (!candidates.length) return null
  if (candidates.length === 1) return candidates[0]

  // Jaccard scoring to resolve ties
  const scored = candidates.map(r => {
    const csvToks = normalizeName(r['Card'] || '').split(' ').filter(t => t)
    const csvSet = new Set(csvToks)
    const overlap = tokens.filter(t => csvSet.has(t)).length
    const union = new Set([...tokens, ...csvToks]).size
    return { r, score: overlap / union, normCard: normalizeName(r['Card'] || ''), csvLen: csvToks.length }
  })
  scored.sort((a, b) => b.score - a.score || a.csvLen - b.csvLen)

  const best = scored[0]
  const second = scored[1]
  if (second && second.score >= best.score * 0.95) {
    const allSame = scored.filter(s => s.score >= best.score * 0.95).every(s => s.normCard === best.normCard)
    if (!allSame) return null
  }
  return best.r
}

function sportKey(sport: string): 'football' | 'basketball' | null {
  if (sport.includes('FB') || sport.toLowerCase().includes('football')) return 'football'
  if (sport.includes('BB') || sport.toLowerCase().includes('basketball')) return 'basketball'
  return null
}

function parsePrice(s: string): number | null {
  if (!s) return null
  const n = parseFloat(s.replace(/[$,]/g, ''))
  return isNaN(n) ? null : n
}

function parsePct(s: string): number | null {
  if (!s) return null
  const n = parseFloat(s.replace(/%/g, ''))
  return isNaN(n) ? null : n
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

const SPORTS = ['football', 'basketball'] as const
const WINDOWS = ['7', '30'] as const

export function useMarketData(entries: PortfolioEntry[]) {
  const eligible = entries.filter(e => !(e.actual_sale !== null && e.actual_sale > 0) && !e.pc)

  // Fetch all 4 CSVs in parallel (always enabled, cached 10 min)
  const csvQueries = useQueries({
    queries: SPORTS.flatMap(sport =>
      WINDOWS.map(window => ({
        queryKey: ['csv', sport, window],
        queryFn: () => fetchCSV(sport, window),
        staleTime: 10 * 60 * 1000,
        retry: false,
      }))
    ),
  })

  const isLoading = csvQueries.some(q => q.isLoading)
  const isError = csvQueries.some(q => q.isError)

  // Map results: i=0 fb-7, i=1 fb-30, i=2 bb-7, i=3 bb-30
  const csvData = useMemo(() => ({
    'football-7':    csvQueries[0].data ?? [],
    'football-30':   csvQueries[1].data ?? [],
    'basketball-7':  csvQueries[2].data ?? [],
    'basketball-30': csvQueries[3].data ?? [],
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [csvQueries[0].data, csvQueries[1].data, csvQueries[2].data, csvQueries[3].data])

  const marketDataMap = useMemo(() => {
    const map = new Map<string, CardMarketDataResult>()
    if (isLoading) return map

    for (const entry of eligible) {
      const sport = sportKey(entry.sport)
      if (!sport) continue

      const rows7  = csvData[`${sport}-7`]
      const rows30 = csvData[`${sport}-30`]

      const r7  = fuzzyFindRow(rows7,  entry.card_name, entry.grade)
      const r30 = fuzzyFindRow(rows30, entry.card_name, entry.grade)

      const avg7d  = r7  ? parsePrice(r7['Avg'])  : null
      const avg30d = r30 ? parsePrice(r30['Avg']) : null

      if (avg7d !== null || avg30d !== null) {
        map.set(entry.id, {
          id: entry.id,
          matched_card: r30?.['Card'] ?? r7?.['Card'] ?? null,
          match_confidence: 'fuzzy',
          avg_7d:        avg7d,
          avg_30d:       avg30d,
          trend_7d_pct:  r7  ? parsePct(r7['Price Change %'])  : null,
          trend_30d_pct: r30 ? parsePct(r30['Price Change %']) : null,
          num_sales_30d: r30 ? (parseInt(r30['# of Sales']) || null) : null,
        })
      }
    }
    return map
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [csvData, isLoading, entries])

  return { marketDataMap, isLoading, isError, error: null as unknown }
}
