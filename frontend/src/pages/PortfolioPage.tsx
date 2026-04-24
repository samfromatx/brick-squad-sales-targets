import { useState } from 'react'
import { EntryForm } from '../features/portfolio/EntryForm'
import { EntryTable } from '../features/portfolio/EntryTable'
import {
  useCreateEntry,
  useDeleteEntry,
  usePortfolioEntries,
  useUpdateEntry,
} from '../features/portfolio/usePortfolioEntries'
import type { PortfolioEntry, PortfolioEntryCreate } from '../lib/types'

type Filter = 'all' | 'above_cost' | 'at_target' | 'hide_pc' | 'pc_only'

function applyFilter(entries: PortfolioEntry[], filter: Filter): PortfolioEntry[] {
  switch (filter) {
    case 'above_cost':
      return entries.filter(e => {
        const cost = e.price_paid + e.grading_cost
        const val = e.target_sell ?? e.actual_sale
        return val !== null && val > cost
      })
    case 'at_target':
      return entries.filter(e => e.target_sell !== null && e.actual_sale === null)
    case 'hide_pc':
      return entries.filter(e => !e.pc)
    case 'pc_only':
      return entries.filter(e => e.pc)
    default:
      return entries
  }
}

export function PortfolioPage() {
  const { data: entriesData, isLoading, isError } = usePortfolioEntries()
  const createEntry = useCreateEntry()
  const updateEntry = useUpdateEntry()
  const deleteEntry = useDeleteEntry()

  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<PortfolioEntry | null>(null)
  const [filter, setFilter] = useState<Filter>('all')

  const allEntries = entriesData?.data ?? []
  const entries = applyFilter(allEntries, filter)

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

  if (isLoading) return <div style={page}><p style={{ color: '#94a3b8' }}>Loading portfolio…</p></div>
  if (isError)   return <div style={page}><p style={{ color: '#dc2626' }}>Failed to load portfolio.</p></div>

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
    { label: 'Total Cards',    value: allEntries.length.toString(), sub: 'Across all entries', color: '#2563eb' },
    { label: 'Total Invested', value: fmtMoney(totalInvested),      sub: 'Cost + grading fees', color: '#7c3aed' },
    { label: 'Target Value',   value: fmtMoney(targetValue),        sub: 'At target sell price', color: '#d97706' },
    { label: 'Target Profit',  value: `${sign(targetProfit)}${fmtMoney(targetProfit)}`,
      sub: totalInvested > 0 ? `${((targetProfit / totalInvested) * 100).toFixed(1)}% ROI` : '',
      color: targetProfit >= 0 ? '#16a34a' : '#dc2626', valueColor: targetProfit >= 0 ? '#16a34a' : '#dc2626' },
    { label: 'Actual Profit',  value: `${sign(actualProfit)}${fmtMoney(actualProfit)}`,
      sub: `${sold.length} cards sold`,
      color: actualProfit >= 0 ? '#16a34a' : '#dc2626', valueColor: actualProfit >= 0 ? '#16a34a' : '#dc2626' },
  ]

  const FILTERS: { key: Filter; label: string }[] = [
    { key: 'all',        label: 'All' },
    { key: 'above_cost', label: 'Above Cost' },
    { key: 'at_target',  label: 'At Target' },
    { key: 'hide_pc',    label: 'Hide PC' },
    { key: 'pc_only',    label: '🎴 PC Only' },
  ]

  return (
    <div style={page}>
      {showForm && (
        <EntryForm
          initial={editing}
          onSubmit={handleSubmit}
          onCancel={() => { setShowForm(false); setEditing(null) }}
          loading={createEntry.isPending || updateEntry.isPending}
        />
      )}

      {/* Page header */}
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ fontSize: 22, color: '#1e293b', marginBottom: 4 }}>🏀🏈 Brick Squad — My Portfolio</h1>
        <p style={{ fontSize: 13, color: '#64748b' }}>Track purchases, cost basis, and target returns · Data synced to the cloud</p>
      </div>

      {/* KPI strip */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 24, flexWrap: 'wrap' }}>
        {kpis.map(k => (
          <div key={k.label} className="kpi-card" style={{ borderTop: `3px solid ${k.color}`, flex: '1 1 140px' }}>
            <div className="kpi-label">{k.label}</div>
            <div className="kpi-value" style={{ fontSize: 20, color: (k as {valueColor?: string}).valueColor ?? '#1e293b' }}>
              {k.value}
            </div>
            <div className="kpi-sub">{k.sub}</div>
          </div>
        ))}
      </div>

      {/* Add button */}
      <div style={{ marginBottom: 20 }}>
        <button onClick={openAdd} className="btn-primary" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          + Add Purchase
        </button>
      </div>

      {/* Filter pills */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
        {FILTERS.map(f => (
          <button
            key={f.key}
            className={`pill-btn${filter === f.key ? ' active' : ''}`}
            onClick={() => setFilter(f.key)}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Table header row */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
        <h2 style={{ fontSize: 14, color: '#1e293b' }}>
          Purchase Log ({entries.length} {filter !== 'all' ? `of ${allEntries.length} ` : ''}entries)
        </h2>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn-secondary" style={{ fontSize: 12, padding: '5px 12px' }}>
            ↑ Import CSV
          </button>
          <button className="btn-secondary" style={{ fontSize: 12, padding: '5px 12px' }}>
            ↓ Export CSV
          </button>
        </div>
      </div>

      <EntryTable
        entries={entries}
        onEdit={openEdit}
        onDelete={handleDelete}
        onMarkSold={openMarkSold}
      />

      {(createEntry.isError || updateEntry.isError || deleteEntry.isError) && (
        <p style={{ color: '#dc2626', marginTop: 12, fontSize: 13 }}>
          {((createEntry.error ?? updateEntry.error ?? deleteEntry.error) as Error)?.message ?? 'An error occurred'}
        </p>
      )}
    </div>
  )
}

const page: React.CSSProperties = {
  maxWidth: 1200,
  margin: '0 auto',
  padding: '28px 20px',
}
