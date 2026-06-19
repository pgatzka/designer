import { useState } from 'react'
import { Modal } from './Modal'
import type { ForeignKey } from '../schema/types'

export interface FkTargetOption {
  /** Value stored in the FK's `table` field (bare name, or schema-qualified). */
  value: string
  label: string
  columns: string[]
}

interface ForeignKeyDialogProps {
  tableLabel: string
  sourceColumns: string[]
  targets: FkTargetOption[]
  taken: string[]
  initial?: ForeignKey
  defaultName: string
  onCancel: () => void
  onSubmit: (fk: ForeignKey) => void
}

function Checklist({
  columns,
  selected,
  onToggle,
  empty,
}: {
  columns: string[]
  selected: string[]
  onToggle: (c: string) => void
  empty: string
}) {
  if (columns.length === 0) return <p className="dialog__hint">{empty}</p>
  return (
    <div className="checklist">
      {columns.map((c) => (
        <label key={c} className="checklist__item">
          <input type="checkbox" checked={selected.includes(c)} onChange={() => onToggle(c)} />
          <span>{c}</span>
        </label>
      ))}
    </div>
  )
}

export function ForeignKeyDialog({
  tableLabel,
  sourceColumns,
  targets,
  taken,
  initial,
  defaultName,
  onCancel,
  onSubmit,
}: ForeignKeyDialogProps) {
  const [name, setName] = useState(initial?.name ?? defaultName)
  const [source, setSource] = useState<string[]>(initial?.sourceColumns ?? [])
  const [targetTable, setTargetTable] = useState(initial?.targetTable ?? targets[0]?.value ?? '')
  const [target, setTarget] = useState<string[]>(initial?.targetColumns ?? [])

  const targetCols = targets.find((t) => t.value === targetTable)?.columns ?? []
  const trimmed = name.trim()
  const duplicate = taken.includes(trimmed)
  const valid =
    trimmed.length > 0 &&
    !duplicate &&
    source.length > 0 &&
    target.length > 0 &&
    source.length === target.length &&
    targetTable.length > 0

  const toggle = (set: (fn: (p: string[]) => string[]) => void) => (col: string) =>
    set((prev) => (prev.includes(col) ? prev.filter((c) => c !== col) : [...prev, col]))

  return (
    <Modal
      title={initial ? 'Edit foreign key' : 'Add foreign key'}
      onCancel={onCancel}
      onSubmit={() =>
        valid &&
        onSubmit({ name: trimmed, sourceColumns: source, targetTable, targetColumns: target })
      }
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
      {duplicate && <p className="field__error">A foreign key named “{trimmed}” already exists.</p>}

      <fieldset className="field">
        <legend>Source columns</legend>
        <Checklist
          columns={sourceColumns}
          selected={source}
          onToggle={toggle(setSource)}
          empty="This table has no columns."
        />
      </fieldset>

      <label className="field">
        <span>Target table</span>
        <select
          value={targetTable}
          onChange={(e) => {
            setTargetTable(e.target.value)
            setTarget([])
          }}
        >
          {targets.map((t) => (
            <option key={t.value} value={t.value}>
              {t.label}
            </option>
          ))}
        </select>
      </label>

      <fieldset className="field">
        <legend>Target columns</legend>
        <Checklist
          columns={targetCols}
          selected={target}
          onToggle={toggle(setTarget)}
          empty="Pick a target table with columns."
        />
      </fieldset>
      {source.length !== target.length && (
        <p className="field__error">Select the same number of source and target columns.</p>
      )}
    </Modal>
  )
}
