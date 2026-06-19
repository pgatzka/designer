import { useState } from 'react'
import { Modal } from './Modal'

interface SchemaManagerDialogProps {
  schemas: string[]
  onAdd: (name: string) => void
  onRename: (oldName: string, newName: string) => void
  onDelete: (name: string) => void
  onClose: () => void
}

function SchemaRow({
  name,
  others,
  onRename,
  onDelete,
}: {
  name: string
  others: string[]
  onRename: (oldName: string, newName: string) => void
  onDelete: (name: string) => void
}) {
  const [value, setValue] = useState(name)
  const trimmed = value.trim()
  const canRename = trimmed.length > 0 && trimmed !== name && !others.includes(trimmed)

  return (
    <div className="schema-row">
      <input value={value} onChange={(e) => setValue(e.target.value)} spellCheck={false} />
      <button
        type="button"
        className="btn"
        disabled={!canRename}
        onClick={() => onRename(name, trimmed)}
      >
        Rename
      </button>
      <button type="button" className="btn btn--danger" onClick={() => onDelete(name)}>
        Delete
      </button>
    </div>
  )
}

export function SchemaManagerDialog({
  schemas,
  onAdd,
  onRename,
  onDelete,
  onClose,
}: SchemaManagerDialogProps) {
  const [newName, setNewName] = useState('')
  const trimmed = newName.trim()
  const canAdd = trimmed.length > 0 && !schemas.includes(trimmed)

  return (
    <Modal title="Manage schemas" onCancel={onClose} onSubmit={onClose} submitLabel="Done">
      <div className="schema-list">
        {schemas.map((s) => (
          <SchemaRow
            key={s}
            name={s}
            others={schemas.filter((x) => x !== s)}
            onRename={onRename}
            onDelete={onDelete}
          />
        ))}
        {schemas.length === 0 && <p className="dialog__hint">No schemas yet.</p>}
      </div>
      <div className="schema-row">
        <input
          value={newName}
          placeholder="new schema name"
          onChange={(e) => setNewName(e.target.value)}
          spellCheck={false}
        />
        <button
          type="button"
          className="btn btn--primary"
          disabled={!canAdd}
          onClick={() => {
            onAdd(trimmed)
            setNewName('')
          }}
        >
          Add
        </button>
      </div>
    </Modal>
  )
}
