import { ImportForm } from '../features/imports/ImportForm'

export function ImportPage() {
  return (
    <div style={page}>
      <h1 style={{ margin: '0 0 8px', fontSize: 22, color: '#f1f5f9' }}>Import Targets</h1>
      <ImportForm />
    </div>
  )
}

const page: React.CSSProperties = {
  maxWidth: 1100, margin: '0 auto', padding: '32px 16px',
  background: '#0f172a', minHeight: '100vh', color: '#e2e8f0',
}
