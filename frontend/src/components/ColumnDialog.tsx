import { useState } from 'react'
import { Modal } from './Modal'
import type { Column } from '../schema/types'
import { typeNames, validateColumnType, type Flavor } from '../schema/flavors'

const FALLBACK_TYPES = [
  'integer',
  'bigint',
  'varchar',
  'text',
  'boolean',
  'timestamp',
  'date',
  'numeric',
  'uuid',
  'json',
]

interface ColumnDialogProps {
  title: string
  tableLabel: string
  initial?: Column
  /** Existing column names in the table (excluding the one being edited). */
  taken: string[]
  /** Active design flavor — drives the type list and length-rule validation. */
  flavor?: Flavor
  onCancel: () => void
  onSubmit: (column: Column) => void
}

export function ColumnDialog({
  title,
  tableLabel,
  initial,
  taken,
  flavor,
  onCancel,
  onSubmit,
}: ColumnDialogProps) {
  const [name, setName] = useState(initial?.name ?? '')
  const [type, setType] = useState(initial?.type ?? (flavor ? typeNames(flavor)[0] : 'varchar'))
  const [length, setLength] = useState(initial?.length != null ? String(initial.length) : '')
  const [nullable, setNullable] = useState(initial?.nullable ?? true)

  const trimmed = name.trim()
  const duplicate = taken.includes(trimmed)
  const lengthNum = length.trim() === '' ? undefined : Number(length)
  const lengthValid = lengthNum === undefined || (Number.isInteger(lengthNum) && lengthNum > 0)
  const typeError =
    flavor && type.trim().length > 0 && lengthValid
      ? validateColumnType(flavor, type.trim(), lengthNum)
      : null
  const valid =
    trimmed.length > 0 && !duplicate && type.trim().length > 0 && lengthValid && !typeError

  const types = flavor ? typeNames(flavor) : FALLBACK_TYPES

  function submit() {
    if (!valid) return
    onSubmit({
      name: trimmed,
      type: type.trim(),
      ...(lengthNum !== undefined ? { length: lengthNum } : {}),
      nullable,
    })
  }

  return (
    <Modal title={title} onCancel={onCancel} onSubmit={submit} submitDisabled={!valid}>
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
      {duplicate && <p className="field__error">A column named “{trimmed}” already exists.</p>}

      <label className="field">
        <span>Type</span>
        <input
          list="column-types"
          value={type}
          onChange={(e) => setType(e.target.value)}
          spellCheck={false}
        />
        <datalist id="column-types">
          {types.map((t) => (
            <option key={t} value={t} />
          ))}
        </datalist>
      </label>
      {typeError && <p className="field__error">{typeError}</p>}

      <label className="field">
        <span>Length (optional)</span>
        <input
          type="number"
          min={1}
          value={length}
          onChange={(e) => setLength(e.target.value)}
          placeholder="e.g. 255"
        />
      </label>
      {!lengthValid && <p className="field__error">Length must be a positive whole number.</p>}

      <label className="field field--checkbox">
        <input type="checkbox" checked={nullable} onChange={(e) => setNullable(e.target.checked)} />
        <span>Nullable</span>
      </label>
    </Modal>
  )
}
