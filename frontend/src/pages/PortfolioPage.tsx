import { useState } from 'react'
import { EntryForm } from '../features/portfolio/EntryForm'
import { EntryTable } from '../features/portfolio/EntryTable'
import { useMarketData } from '../features/portfolio/useMarketData'
import {
  useCreateEntry,
  useDeleteEntry,
  usePortfolioEntries,
  useUpdateEntry,
} from '../features/portfolio/usePortfolioEntries'
import type { CardMarketDataResult, PortfolioEntry, PortfolioEntryCreate } from '../lib/types'

type SoldFilter = 'all' | 'unsold' | 'sold'
type PcFilter   = 'all' | 'hide_pc' | 'pc_only'

function applyFilters(
  entries: PortfolioEntry[],
  soldFilter: SoldFilter,
  pcFilter: PcFilter,
  avg7dFilter: boolean,
  avg30dFilter: boolean,
  marketDataMap: Map<string, CardMarketDataResult> | undefined,
  marketDataLoading: boolean,
): PortfolioEntry[] {
  return entries.filter(e => {
    if (soldFilter === 'unsold' && e.actual_sale !== null) return false
    if (soldFilter === 'sold'   && e.actual_sale === null) return false
    if (pcFilter   === 'hide_pc'  && e.pc)  return false
    if (pcFilter   === 'pc_only'  && !e.pc) return false
    if (!marketDataLoading) {
      const md = marketDataMap?.get(e.id)
      if (avg7dFilter  && !(md?.avg_7d  != null && md.avg_7d  > e.price_paid)) return false
      if (avg30dFilter && !(md?.avg_30d != null && md.avg_30d > e.price_paid)) return false
    }
    return true
  })
}

export function PortfolioPage() {
  const { data: entriesData, isLoading, isError } = usePortfolioEntries()
  const createEntry = useCreateEntry()
  const updateEntry = useUpdateEntry()
  const deleteEntry = useDeleteEntry()

  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<PortfolioEntry | null>(null)
  const [soldFilter, setSoldFilter] = useState<SoldFilter>('all')
  const [pcFilter,   setPcFilter]   = useState<PcFilter>('all')
  const [avg7dFilter,  setAvg7dFilter]  = useState(false)
  const [avg30dFilter, setAvg30dFilter] = useState(false)

  const allEntries = entriesData?.data ?? []
  const { marketDataMap, isLoading: marketDataLoading } = useMarketData(allEntries)
  const entries = applyFilters(allEntries, soldFilter, pcFilter, avg7dFilter, avg30dFilter, marketDataMap, marketDataLoading)

  function openAdd() { setEditing(null); setShowForm(true) }
  function openEdit(e: PortfolioEntry) { setEditing(e); setShowForm(true) }

  function openMarkSold(entry: PortfolioEntry) {
    setEditing({ ...entry, actual_sale: entry.actual_sale ?? 0, sale_venue: entry.sale_venue ?? 'eBay' })
    setShowForm(true)
  }

  async function handleSubmit(data: PortfolioEntryCreate) {
    if (editing) {
      await updateEntry.mutateAsync({ id: editing.id, data })
    } else {
      await createEntry.mutateAsync(data)
    }
    setShowForm(false)
    setEditing(null)
  }

  async function handleDelete(id: string) {
    if (!window.confirm('Delete this entry?')) return
    await deleteEntry.mutateAsync(id)
  }

  if (isLoading) return <div style={page}><p style={{ color: '#888780' }}>Loading portfolio…</p></div>
  if (isError)   return <div style={page}><p style={{ color: '#a32d2d' }}>Failed to load portfolio.</p></div>

  const nonPc = allEntries.filter(e => !e.pc)
  const totalInvested = nonPc.reduce((s, e) => s + e.price_paid + e.grading_cost, 0)
  const targetValue = nonPc.reduce((s, e) => s + (e.target_sell ?? 0), 0)
  const targetProfit = targetValue - totalInvested
  const sold = allEntries.filter(e => e.actual_sale !== null)
  const actualProfit = sold.reduce((s, e) => {
    const cost = e.price_paid + e.grading_cost
    const ebay = e.sale_venue?.toLowerCase().includes('ebay')
    const net = ebay ? (e.actual_sale ?? 0) * (1 - 0.1325) : (e.actual_sale ?? 0)
    return s + net - cost
  }, 0)

  const fmtMoney = (v: number) => `$${Math.abs(v).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
  const sign = (v: number) => v >= 0 ? '+' : '-'

  const kpis = [
    { label: 'Total Cards',    value: allEntries.length.toString(), sub: 'Across all entries',   color: '#85b7eb' },
    { label: 'Total Invested', value: fmtMoney(totalInvested),      sub: 'Cost + grading fees',  color: '#d0cec6' },
    { label: 'Target Value',   value: fmtMoney(targetValue),        sub: 'At target sell price', color: '#f59e0b' },
    { label: 'Target Profit',  value: `${sign(targetProfit)}${fmtMoney(targetProfit)}`,
      sub: totalInvested > 0 ? `${((targetProfit / totalInvested) * 100).toFixed(1)}% ROI` : '',
      color: targetProfit >= 0 ? '#22c55e' : '#ef4444', valueColor: targetProfit >= 0 ? '#3b6d11' : '#a32d2d' },
    { label: 'Actual Profit',  value: `${sign(actualProfit)}${fmtMoney(actualProfit)}`,
      sub: `${sold.length} cards sold`,
      color: actualProfit >= 0 ? '#22c55e' : '#ef4444', valueColor: actualProfit >= 0 ? '#3b6d11' : '#a32d2d' },
  ]

  return (
    <div style={page}>
      {showForm && (
        <EntryForm
          key={editing?.id ?? 'new'}
          initial={editing}
          onSubmit={handleSubmit}
          onCancel={() => { setShowForm(false); setEditing(null) }}
          loading={createEntry.isPending || updateEntry.isPending}
        />
      )}

      {/* Page header */}
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: 'var(--ink)', letterSpacing: '-0.5px' }}>My Portfolio</h1>
        <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--ink-3)' }}>Track purchases, cost basis, and target returns</p>
      </div>

      {/* KPI strip */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 24, flexWrap: 'wrap' }}>
        {kpis.map(k => (
          <div key={k.label} className="kpi-card" style={{ borderTop: `3px solid ${k.color}`, flex: '1 1 140px' }}>
            <div className="kpi-label">{k.label}</div>
            <div className="kpi-value" style={{ color: (k as {valueColor?: string}).valueColor ?? '#1a1a18' }}>
              {k.value}
            </div>
            <div className="kpi-sub">{k.sub}</div>
          </div>
        ))}
      </div>

      {/* Add button + segmented filter controls */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
        <button onClick={openAdd} className="btn-primary" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          + Add Purchase
        </button>

        {/* Sold status segmented control */}
        <div style={segmentedWrap}>
          {([['all', 'All'], ['unsold', 'Unsold'], ['sold', 'Sold']] as [SoldFilter, string][]).map(([key, label]) => (
            <button key={key} onClick={() => setSoldFilter(key)} style={segmentedBtn(soldFilter === key, false)}>
              {label}
            </button>
          ))}
        </div>

        {/* PC toggle segmented control */}
        <div style={segmentedWrap}>
          {([['all', 'All'], ['hide_pc', 'Hide PC'], ['pc_only', 'PC Only']] as [PcFilter, string][]).map(([key, label]) => (
            <button key={key} onClick={() => setPcFilter(key)} style={segmentedBtn(pcFilter === key, key === 'pc_only' && pcFilter === 'pc_only')}>
              {label}
            </button>
          ))}
        </div>

        {/* Under-average filters */}
        <button onClick={() => setAvg7dFilter(v => !v)} style={avgToggleBtn(avg7dFilter)}>
          Under 7D Avg
        </button>
        <button onClick={() => setAvg30dFilter(v => !v)} style={avgToggleBtn(avg30dFilter)}>
          Under 30D Avg
        </button>

        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
          <button className="btn-secondary" style={{ fontSize: '.78rem', padding: '5px 12px' }}>↓ Export CSV</button>
        </div>
      </div>

      {/* Table header row */}
      <div style={{ marginBottom: 12 }}>
        <h2 className="section-title" style={{ marginBottom: 0 }}>
          Purchase Log
          <span style={{ fontSize: '.78rem', fontWeight: 400, color: 'var(--ink-3)' }}>
            {entries.length}{(soldFilter !== 'all' || pcFilter !== 'all' || avg7dFilter || avg30dFilter) ? ` of ${allEntries.length}` : ''} entries
          </span>
        </h2>
      </div>

      <EntryTable
        entries={entries}
        marketDataMap={marketDataMap}
        marketDataLoading={marketDataLoading}
        onEdit={openEdit}
        onDelete={handleDelete}
        onMarkSold={openMarkSold}
        onPcFilterClick={() => setPcFilter(f => f === 'pc_only' ? 'all' : 'pc_only')}
      />

      {(createEntry.isError || updateEntry.isError || deleteEntry.isError) && (
        <p style={{ color: '#a32d2d', marginTop: 12, fontSize: 13 }}>
          {((createEntry.error ?? updateEntry.error ?? deleteEntry.error) as Error)?.message ?? 'An error occurred'}
        </p>
      )}
    </div>
  )
}

const page: React.CSSProperties = {
  maxWidth: 1200,
  margin: '0 auto',
  padding: '24px 20px',
}

const segmentedWrap: React.CSSProperties = {
  display: 'flex',
  borderRadius: 8,
  border: '1px solid var(--border)',
  overflow: 'hidden',
  background: 'var(--bg-3)',
  padding: 2,
  gap: 2,
}

function segmentedBtn(active: boolean, isPcOnly: boolean): React.CSSProperties {
  return {
    padding: '5px 13px',
    fontSize: 12,
    fontWeight: active ? 600 : 400,
    color: active ? 'var(--ink)' : 'var(--ink-3)',
    background: active ? (isPcOnly ? '#ede9fe' : 'var(--bg)') : 'transparent',
    border: 'none',
    boxShadow: active ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
    cursor: 'pointer',
    transition: 'all 0.12s',
    borderRadius: 6,
    fontFamily: 'inherit',
  }
}

function avgToggleBtn(active: boolean): React.CSSProperties {
  return {
    padding: '5px 13px',
    fontSize: 12,
    fontWeight: active ? 600 : 400,
    color: active ? '#1a4d2e' : 'var(--ink-3)',
    background: active ? '#e6faf2' : 'var(--bg-3)',
    border: `1px solid ${active ? '#a3d9b8' : 'var(--border)'}`,
    boxShadow: active ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
    cursor: 'pointer',
    transition: 'all 0.12s',
    borderRadius: 8,
    fontFamily: 'inherit',
  }
}
