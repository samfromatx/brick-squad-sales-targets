import { useState } from 'react'
import { EntryForm } from '../features/portfolio/EntryForm'
import { EntryTable } from '../features/portfolio/EntryTable'
import {
  useCreateEntry,
  useDeleteEntry,
  usePortfolioAllocations,
  usePortfolioEntries,
  useUpdateEntry,
} from '../features/portfolio/usePortfolioEntries'
import type { PortfolioEntry, PortfolioEntryCreate } from '../lib/types'

export function PortfolioPage() {
  const { data: entriesData, isLoading, isError } = usePortfolioEntries()
  const { data: allocData } = usePortfolioAllocations()
  const createEntry = useCreateEntry()
  const updateEntry = useUpdateEntry()
  const deleteEntry = useDeleteEntry()

  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<PortfolioEntry | null>(null)
  const [markingSold, setMarkingSold] = useState<PortfolioEntry | null>(null)

  const entries = entriesData?.data ?? []
  const allocations = allocData?.data ?? []

  function openAdd() {
    setEditing(null)
    setMarkingSold(null)
    setShowForm(true)
  }

  function openEdit(entry: PortfolioEntry) {
    setEditing(entry)
    setMarkingSold(null)
    setShowForm(true)
  }

  function openMarkSold(entry: PortfolioEntry) {
    setMarkingSold({ ...entry })
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
    setMarkingSold(null)
  }

  async function handleDelete(id: string) {
    if (!window.confirm('Delete this entry?')) return
    await deleteEntry.mutateAsync(id)
  }

  const isMutating = createEntry.isPending || updateEntry.isPending

  if (isLoading) {
    return <div style={page}><p style={{ color: '#94a3b8' }}>Loading portfolio…</p></div>
  }
  if (isError) {
    return <div style={page}><p style={{ color: '#ef4444' }}>Failed to load portfolio.</p></div>
  }

  const totalCost = entries.filter(e => !e.pc).reduce((s, e) => s + e.price_paid + e.grading_cost, 0)
  const sold = entries.filter(e => e.actual_sale !== null)
  const active = entries.filter(e => e.actual_sale === null && !e.pc)

  return (
    <div style={page}>
      {showForm && (
        <EntryForm
          initial={editing}
          onSubmit={handleSubmit}
          onCancel={() => { setShowForm(false); setEditing(null); setMarkingSold(null) }}
          loading={isMutating}
        />
      )}

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <h1 style={{ margin: 0, fontSize: 22, color: '#f1f5f9' }}>Portfolio</h1>
        <button onClick={openAdd} style={btnPrimary}>+ Add card</button>
      </div>

      {/* Summary strip */}
      <div style={{ display: 'flex', gap: 16, marginBottom: 24, flexWrap: 'wrap' }}>
        {[
          { label: 'Active', value: active.length },
          { label: 'Sold', value: sold.length },
          { label: 'Invested', value: `$${totalCost.toLocaleString(undefined, { maximumFractionDigits: 0 })}` },
        ].map(({ label, value }) => (
          <div key={label} style={statCard}>
            <div style={{ fontSize: 11, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</div>
            <div style={{ fontSize: 20, fontWeight: 700, color: '#f1f5f9' }}>{value}</div>
          </div>
        ))}
      </div>

      <EntryTable
        entries={entries}
        onEdit={openEdit}
        onDelete={handleDelete}
        onMarkSold={openMarkSold}
      />

      {/* Portfolio allocations */}
      {allocations.length > 0 && (
        <section style={{ marginTop: 40 }}>
          <h2 style={{ fontSize: 16, color: '#cbd5e1', marginBottom: 12, borderBottom: '1px solid #1e293b', paddingBottom: 6 }}>
            Budget Allocations
          </h2>
          <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
            {allocations.map(tier => (
              <div key={tier.tier} style={tierCard}>
                <h3 style={{ margin: '0 0 8px', fontSize: 14, color: '#94a3b8' }}>${tier.tier} tier</h3>
                {tier.allocations.map((a, i) => (
                  <div key={i} style={{ fontSize: 12, color: '#e2e8f0', marginBottom: 4 }}>
                    <span style={{ color: '#64748b' }}>${a.budget}</span> — {a.card_name}
                    {a.thesis && <span style={{ color: '#475569', marginLeft: 4 }}>({a.thesis})</span>}
                  </div>
                ))}
              </div>
            ))}
          </div>
        </section>
      )}

      {/* mutation errors */}
      {(createEntry.isError || updateEntry.isError || deleteEntry.isError) && (
        <p style={{ color: '#ef4444', marginTop: 12 }}>
          {(createEntry.error ?? updateEntry.error ?? deleteEntry.error) instanceof Error
            ? (createEntry.error ?? updateEntry.error ?? deleteEntry.error as Error).message
            : 'An error occurred'}
        </p>
      )}

      {markingSold && <div />}
    </div>
  )
}

const page: React.CSSProperties = {
  maxWidth: 1100, margin: '0 auto', padding: '32px 16px',
  background: '#0f172a', minHeight: '100vh', color: '#e2e8f0',
}
const btnPrimary: React.CSSProperties = {
  background: '#2563eb', color: '#fff', border: 'none',
  borderRadius: 4, padding: '8px 16px', cursor: 'pointer', fontSize: 13,
}
const statCard: React.CSSProperties = {
  background: '#1e293b', borderRadius: 8, padding: '12px 20px', minWidth: 100,
}
const tierCard: React.CSSProperties = {
  background: '#1e293b', borderRadius: 8, padding: '14px 16px', minWidth: 200, flex: '1 1 200px',
}
