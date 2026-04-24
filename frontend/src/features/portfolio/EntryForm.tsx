import { useEffect, useState } from 'react'
import type { PortfolioEntry, PortfolioEntryCreate } from '../../lib/types'

interface Props {
  initial?: PortfolioEntry | null
  onSubmit: (data: PortfolioEntryCreate) => void
  onCancel: () => void
  loading: boolean
}

const BLANK: PortfolioEntryCreate = {
  card_name: '',
  sport: 'football',
  grade: 'PSA 10',
  price_paid: 0,
  grading_cost: 0,
  target_sell: null,
  actual_sale: null,
  sale_venue: null,
  purchase_date: null,
  notes: null,
  pc: false,
}

export function EntryForm({ initial, onSubmit, onCancel, loading }: Props) {
  const [form, setForm] = useState<PortfolioEntryCreate>(BLANK)

  useEffect(() => {
    if (initial) {
      setForm({
        card_name: initial.card_name,
        sport: initial.sport,
        grade: initial.grade,
        price_paid: initial.price_paid,
        grading_cost: initial.grading_cost,
        target_sell: initial.target_sell,
        actual_sale: initial.actual_sale,
        sale_venue: initial.sale_venue,
        purchase_date: initial.purchase_date,
        notes: initial.notes,
        pc: initial.pc,
      })
    } else {
      setForm(BLANK)
    }
  }, [initial])

  function set<K extends keyof PortfolioEntryCreate>(key: K, value: PortfolioEntryCreate[K]) {
    setForm(f => ({ ...f, [key]: value }))
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    onSubmit(form)
  }

  return (
    <div style={overlay}>
      <div style={modal}>
        <h2 style={{ margin: '0 0 16px', fontSize: 16, color: '#f1f5f9' }}>
          {initial ? 'Edit entry' : 'Add entry'}
        </h2>
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <Row label="Card name">
            <input style={input} value={form.card_name} required
              onChange={e => set('card_name', e.target.value)} />
          </Row>
          <Row label="Sport">
            <select style={input} value={form.sport} onChange={e => set('sport', e.target.value)}>
              <option value="football">Football</option>
              <option value="basketball">Basketball</option>
            </select>
          </Row>
          <Row label="Grade">
            <input style={input} value={form.grade} required
              onChange={e => set('grade', e.target.value)} />
          </Row>
          <Row label="Price paid">
            <input style={input} type="number" step="0.01" value={form.price_paid} required
              onChange={e => set('price_paid', parseFloat(e.target.value) || 0)} />
          </Row>
          <Row label="Grading cost">
            <input style={input} type="number" step="0.01" value={form.grading_cost ?? 0}
              onChange={e => set('grading_cost', parseFloat(e.target.value) || 0)} />
          </Row>
          <Row label="Target sell">
            <input style={input} type="number" step="0.01"
              value={form.target_sell ?? ''}
              onChange={e => set('target_sell', e.target.value ? parseFloat(e.target.value) : null)} />
          </Row>
          <Row label="Actual sale">
            <input style={input} type="number" step="0.01"
              value={form.actual_sale ?? ''}
              onChange={e => set('actual_sale', e.target.value ? parseFloat(e.target.value) : null)} />
          </Row>
          <Row label="Sale venue">
            <input style={input} value={form.sale_venue ?? ''}
              onChange={e => set('sale_venue', e.target.value || null)} />
          </Row>
          <Row label="Purchase date">
            <input style={input} type="date" value={form.purchase_date ?? ''}
              onChange={e => set('purchase_date', e.target.value || null)} />
          </Row>
          <Row label="Notes">
            <input style={input} value={form.notes ?? ''}
              onChange={e => set('notes', e.target.value || null)} />
          </Row>
          <Row label="PC (personal collection)">
            <input type="checkbox" checked={form.pc ?? false}
              onChange={e => set('pc', e.target.checked)} />
          </Row>
          <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
            <button type="submit" disabled={loading} style={btnPrimary}>
              {loading ? 'Saving…' : 'Save'}
            </button>
            <button type="button" onClick={onCancel} style={btnSecondary}>Cancel</button>
          </div>
        </form>
      </div>
    </div>
  )
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 3, fontSize: 12, color: '#94a3b8' }}>
      {label}
      {children}
    </label>
  )
}

const overlay: React.CSSProperties = {
  position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)',
  display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100,
}
const modal: React.CSSProperties = {
  background: '#1e293b', borderRadius: 8, padding: 24,
  width: 420, maxHeight: '90vh', overflowY: 'auto',
}
const input: React.CSSProperties = {
  background: '#0f172a', border: '1px solid #334155', borderRadius: 4,
  padding: '5px 8px', color: '#e2e8f0', fontSize: 13, width: '100%',
}
const btnPrimary: React.CSSProperties = {
  background: '#2563eb', color: '#fff', border: 'none',
  borderRadius: 4, padding: '7px 16px', cursor: 'pointer', fontSize: 13,
}
const btnSecondary: React.CSSProperties = {
  background: '#334155', color: '#e2e8f0', border: 'none',
  borderRadius: 4, padding: '7px 16px', cursor: 'pointer', fontSize: 13,
}
