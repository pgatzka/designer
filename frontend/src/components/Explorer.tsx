import type { DesignSummary } from '../designs/api'

interface ExplorerProps {
  designs: DesignSummary[]
  activeId: string | null
  busy: boolean
  onSelect: (id: string) => void
  onNew: () => void
  onImport: () => void
  onDelete: (id: string) => void
}

export function Explorer({
  designs,
  activeId,
  busy,
  onSelect,
  onNew,
  onImport,
  onDelete,
}: ExplorerProps) {
  return (
    <aside className="explorer">
      <div className="explorer__head">
        <span className="explorer__title">Designs</span>
        <div className="explorer__actions">
          <button
            className="explorer__import"
            onClick={onImport}
            disabled={busy}
            title="Import from a database"
          >
            Import
          </button>
          <button className="explorer__new" onClick={onNew} disabled={busy} title="New design">
            + New
          </button>
        </div>
      </div>
      <ul className="explorer__list">
        {designs.map((d) => (
          <li key={d.id} className={`explorer__item${d.id === activeId ? ' is-active' : ''}`}>
            <button
              type="button"
              className="explorer__name"
              title={d.name}
              onClick={() => onSelect(d.id)}
            >
              {d.name}
            </button>
            <button
              type="button"
              className="explorer__delete"
              title="Delete design"
              onClick={() => onDelete(d.id)}
            >
              ×
            </button>
          </li>
        ))}
        {designs.length === 0 && <li className="explorer__empty">No designs yet</li>}
      </ul>
    </aside>
  )
}
