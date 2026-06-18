import type { DesignSummary } from '../designs/api'

interface ExplorerProps {
  designs: DesignSummary[]
  activeId: string | null
  busy: boolean
  onSelect: (id: string) => void
  onNew: () => void
  onDelete: (id: string) => void
}

export function Explorer({ designs, activeId, busy, onSelect, onNew, onDelete }: ExplorerProps) {
  return (
    <aside className="explorer">
      <div className="explorer__head">
        <span className="explorer__title">Designs</span>
        <button className="explorer__new" onClick={onNew} disabled={busy} title="New design">
          + New
        </button>
      </div>
      <ul className="explorer__list">
        {designs.map((d) => (
          <li
            key={d.id}
            className={`explorer__item${d.id === activeId ? ' is-active' : ''}`}
            onClick={() => onSelect(d.id)}
          >
            <span className="explorer__name" title={d.name}>
              {d.name}
            </span>
            <button
              className="explorer__delete"
              title="Delete design"
              onClick={(e) => {
                e.stopPropagation()
                onDelete(d.id)
              }}
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
