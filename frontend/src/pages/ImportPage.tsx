import { ImportForm } from '../features/imports/ImportForm'

export function ImportPage() {
  return (
    <div className="page-content">
      <h1 style={{ margin: '0 0 8px', fontSize: 22, color: '#1e293b' }}>Import Targets</h1>
      <ImportForm />
    </div>
  )
}
