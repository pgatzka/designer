export interface MenuItem {
  label: string
  onClick?: () => void
  submenu?: MenuItem[]
  disabled?: boolean
}

interface ContextMenuProps {
  x: number
  y: number
  items: MenuItem[]
  onClose: () => void
}

function MenuRow({ item, onClose }: { item: MenuItem; onClose: () => void }) {
  if (item.submenu) {
    return (
      <li className="menu-item menu-item--has-sub">
        <button type="button" className="menu-btn">
          {item.label}
          <span className="menu-caret">▸</span>
        </button>
        <ul className="submenu">
          {item.submenu.map((sub, i) => (
            <MenuRow key={i} item={sub} onClose={onClose} />
          ))}
        </ul>
      </li>
    )
  }
  return (
    <li className="menu-item">
      <button
        type="button"
        className="menu-btn"
        disabled={item.disabled}
        onClick={() => {
          item.onClick?.()
          onClose()
        }}
      >
        {item.label}
      </button>
    </li>
  )
}

/** A right-click context menu rendered at a fixed viewport position. */
export function ContextMenu({ x, y, items, onClose }: ContextMenuProps) {
  return (
    <>
      <div
        className="menu-backdrop"
        onMouseDown={onClose}
        onContextMenu={(e) => {
          e.preventDefault()
          onClose()
        }}
      />
      <ul className="context-menu" style={{ left: x, top: y }}>
        {items.map((item, i) => (
          <MenuRow key={i} item={item} onClose={onClose} />
        ))}
      </ul>
    </>
  )
}
