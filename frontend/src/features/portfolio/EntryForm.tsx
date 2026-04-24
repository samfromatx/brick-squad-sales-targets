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
        <h2 style={{ margin: '0 0 16px', fontSize: 16, color: '#1a1a18' }}>
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
    <label style={{ display: 'flex', flexDirection: 'column', gap: 3, fontSize: '.72rem', color: '#6b7280', textTransform: 'uppercase', letterSpacing: '.4px' }}>
      {label}
      {children}
    </label>
  )
}

const overlay: React.CSSProperties = {
  position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.25)',
  display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200,
}
const modal: React.CSSProperties = {
  background: '#fff', borderRadius: 12, padding: 24, boxShadow: '0 8px 32px rgba(0,0,0,0.1)',
  width: 440, maxHeight: '90vh', overflowY: 'auto', border: '1px solid #e2e0d8',
}
const input: React.CSSProperties = {
  background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: 6,
  padding: '7px 10px', color: '#111827', fontSize: '.82rem', width: '100%',
  fontFamily: 'inherit', outline: 'none',
}
const btnPrimary: React.CSSProperties = {
  background: '#E8593C', color: '#fff', border: 'none',
  borderRadius: 6, padding: '8px 18px', cursor: 'pointer', fontSize: '.82rem', fontWeight: 600,
}
const btnSecondary: React.CSSProperties = {
  background: '#f9fafb', color: '#374151', border: '1px solid #e5e7eb',
  borderRadius: 6, padding: '8px 18px', cursor: 'pointer', fontSize: '.82rem',
}
