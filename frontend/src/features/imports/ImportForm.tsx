import { useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { api } from '../../lib/api'

export function ImportForm() {
  const qc = useQueryClient()
  const fileRef = useRef<HTMLInputElement>(null)
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle')
  const [message, setMessage] = useState('')
  const [fileName, setFileName] = useState('')

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setFileName(file.name)
    setStatus('idle')
    setMessage('')
  }

  async function handleUpload() {
    const file = fileRef.current?.files?.[0]
    if (!file) return

    setStatus('loading')
    setMessage('')

    let payload: Record<string, unknown>
    try {
      const text = await file.text()
      payload = JSON.parse(text) as Record<string, unknown>
    } catch {
      setStatus('error')
      setMessage('Invalid JSON — could not parse the file.')
      return
    }

    try {
      const result = await api.importTargets(payload)
      setStatus('success')
      const sections = result.imported.join(', ')
      setMessage(`Imported: ${sections}. Last updated: ${result.last_updated || '—'}`)
      // Invalidate everything so the dashboard/portfolio refresh automatically
      await qc.invalidateQueries()
    } catch (err) {
      setStatus('error')
      setMessage(err instanceof Error ? err.message : 'Import failed.')
    }
  }

  function handleClear() {
    if (fileRef.current) fileRef.current.value = ''
    setFileName('')
    setStatus('idle')
    setMessage('')
  }

  return (
    <div style={{ maxWidth: 540 }}>
      <p style={{ color: '#94a3b8', fontSize: 13, marginBottom: 20 }}>
        Upload a JSON file in the current import format to replace target data.
        Sections present in the file will be replaced; absent sections are left unchanged.
      </p>

      <div
        style={dropZone(status)}
        onClick={() => fileRef.current?.click()}
        onDragOver={e => e.preventDefault()}
        onDrop={e => {
          e.preventDefault()
          if (fileRef.current && e.dataTransfer.files[0]) {
            const dt = new DataTransfer()
            dt.items.add(e.dataTransfer.files[0])
            fileRef.current.files = dt.files
            setFileName(e.dataTransfer.files[0].name)
            setStatus('idle')
            setMessage('')
          }
        }}
      >
        <input
          ref={fileRef}
          type="file"
          accept=".json,application/json"
          style={{ display: 'none' }}
          onChange={handleFile}
        />
        {fileName ? (
          <span style={{ color: '#e2e8f0', fontSize: 14 }}>📄 {fileName}</span>
        ) : (
          <span style={{ color: '#475569', fontSize: 13 }}>
            Click or drag a .json file here
          </span>
        )}
      </div>

      <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
        <button
          onClick={handleUpload}
          disabled={!fileName || status === 'loading'}
          style={btnPrimary(!fileName || status === 'loading')}
        >
          {status === 'loading' ? 'Importing…' : 'Import'}
        </button>
        {fileName && (
          <button onClick={handleClear} style={btnSecondary}>Clear</button>
        )}
      </div>

      {status === 'success' && (
        <div style={feedback('#166534', '#bbf7d0')}>
          ✓ {message}
        </div>
      )}
      {status === 'error' && (
        <div style={feedback('#7f1d1d', '#fecaca')}>
          ✗ {message}
        </div>
      )}

      <details style={{ marginTop: 32 }}>
        <summary style={{ color: '#64748b', fontSize: 12, cursor: 'pointer' }}>
          Expected JSON format
        </summary>
        <pre style={codeBlock}>{JSON.stringify({
          last_updated: 'YYYY-MM-DD',
          football_graded: [{ rank: 1, card: '…', grade: 'PSA 10', target: 0, max: 0, trend: '+0%', vol: 'high', sell_at: 0, rationale: '…', new: false }],
          basketball_graded: ['…same shape…'],
          football_raw_to_grade: [{ rank: 1, card: '…', target_raw: 0, max_raw: 0, trend: '+0%', est_psa9: 0, est_psa10: 0, gem_rate: 0, vol: 'med', roi: 0, sell_at: 0, rationale: '…', new: false }],
          basketball_raw_to_grade: ['…same shape…'],
          bounce_back: [{ rank: 1, card: '…', sport: 'football', grade: 'PSA 10', target: 0, max: 0, trend: '-10%', vol: 'low', sell_at: 0, rationale: '…', new: false, score: 4, s1_cheap: true, s2_stable: true, s3_not_priced_in: true, s4_volume: false, s5_no_spike: false }],
          portfolios: { '1000': { total: 1000, allocations: [{ card: '…', type: 'graded', cost_each: 0, qty: 1, subtotal: 0 }] } },
          ebay_searches: [{ sport: 'football', category: 'graded', search_text: '…', card: '…', rank: 1 }],
        }, null, 2)}</pre>
      </details>
    </div>
  )
}

function dropZone(status: string): React.CSSProperties {
  const borderColor = status === 'success' ? '#22c55e' : status === 'error' ? '#ef4444' : '#334155'
  return {
    border: `2px dashed ${borderColor}`,
    borderRadius: 8,
    padding: '32px 24px',
    textAlign: 'center',
    cursor: 'pointer',
    background: '#1e293b',
    transition: 'border-color 0.2s',
  }
}

function btnPrimary(disabled: boolean): React.CSSProperties {
  return {
    background: disabled ? '#1e3a5f' : '#2563eb',
    color: disabled ? '#475569' : '#fff',
    border: 'none', borderRadius: 4,
    padding: '8px 20px', cursor: disabled ? 'not-allowed' : 'pointer', fontSize: 13,
  }
}

const btnSecondary: React.CSSProperties = {
  background: '#334155', color: '#e2e8f0', border: 'none',
  borderRadius: 4, padding: '8px 16px', cursor: 'pointer', fontSize: 13,
}

function feedback(bg: string, color: string): React.CSSProperties {
  return {
    marginTop: 16, padding: '10px 14px', borderRadius: 6,
    background: bg, color, fontSize: 13,
  }
}

const codeBlock: React.CSSProperties = {
  marginTop: 10, background: '#1e293b', borderRadius: 6,
  padding: '12px 14px', fontSize: 11, color: '#94a3b8',
  overflowX: 'auto', maxHeight: 320,
}
