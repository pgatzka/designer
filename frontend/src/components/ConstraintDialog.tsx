import { useState } from 'react'
import { Modal } from './Modal'
import type { Constraint, ConstraintType } from '../schema/types'

const TYPE_LABEL: Record<ConstraintType, string> = {
  'primary-key': 'Primary key',
  unique: 'Unique',
  index: 'Index',
}

interface ConstraintDialogProps {
  type: ConstraintType
  tableLabel: string
  columns: string[]
  taken: string[]
  defaultName: string
  onCancel: () => void
  onSubmit: (constraint: Constraint) => void
}

export function ConstraintDialog({
  type,
  tableLabel,
  columns,
  taken,
  defaultName,
  onCancel,
  onSubmit,
}: ConstraintDialogProps) {
  const [name, setName] = useState(defaultName)
  const [selected, setSelected] = useState<string[]>([])

  const trimmed = name.trim()
  const duplicate = taken.includes(trimmed)
  const valid = trimmed.length > 0 && !duplicate && selected.length > 0

  function toggle(col: string) {
    setSelected((prev) => (prev.includes(col) ? prev.filter((c) => c !== col) : [...prev, col]))
  }

  return (
    <Modal
      title={`Add ${TYPE_LABEL[type]}`}
      onCancel={onCancel}
      onSubmit={() => valid && onSubmit({ name: trimmed, type, columns: selected })}
      submitDisabled={!valid}
    >
      <p className="dialog__hint">{tableLabel}</p>
      <label className="field">
        <span>Name</span>
        <input
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          spellCheck={false}
        />
      </label>
      {duplicate && <p className="field__error">A constraint named “{trimmed}” already exists.</p>}

      <fieldset className="field">
        <legend>Columns (in order selected)</legend>
        <div className="checklist">
          {columns.map((col) => (
            <label key={col} className="checklist__item">
              <input
                type="checkbox"
                checked={selected.includes(col)}
                onChange={() => toggle(col)}
              />
              <span>{col}</span>
            </label>
          ))}
          {columns.length === 0 && <p className="dialog__hint">This table has no columns yet.</p>}
        </div>
      </fieldset>
    </Modal>
  )
}
