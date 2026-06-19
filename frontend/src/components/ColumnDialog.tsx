import { useState } from 'react'
import { Modal } from './Modal'
import type { Column } from '../schema/types'
import { lengthRuleFor, typeNames, validateColumnType, type Flavor } from '../schema/flavors'

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
  const types = flavor ? typeNames(flavor) : FALLBACK_TYPES

  const [name, setName] = useState(initial?.name ?? '')
  const [type, setType] = useState(initial?.type ?? types[0])
  const [length, setLength] = useState(initial?.length != null ? String(initial.length) : '')
  const [nullable, setNullable] = useState(initial?.nullable ?? true)

  // Keep the current value selectable even if it isn't in the catalog (e.g. editing a
  // legacy column whose type predates the flavor's list).
  const options = types.includes(type) ? types : [type, ...types]

  // Without a flavor we can't know the rule, so treat length as optional.
  const rule = flavor ? lengthRuleFor(flavor, type) : 'optional'
  const showLength = rule !== 'forbidden'

  const trimmed = name.trim()
  const duplicate = taken.includes(trimmed)
  // When the length field is hidden, ignore any stale value left in state.
  const lengthNum = showLength && length.trim() !== '' ? Number(length) : undefined
  const lengthValid = lengthNum === undefined || (Number.isInteger(lengthNum) && lengthNum > 0)
  const typeError =
    flavor && type.length > 0 && lengthValid ? validateColumnType(flavor, type, lengthNum) : null
  const valid = trimmed.length > 0 && !duplicate && type.length > 0 && lengthValid && !typeError

  function submit() {
    if (!valid) return
    onSubmit({
      name: trimmed,
      type,
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
        <select value={type} onChange={(e) => setType(e.target.value)}>
          {options.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
      </label>
      {typeError && <p className="field__error">{typeError}</p>}

      {showLength && (
        <label className="field">
          <span>Length {rule === 'required' ? '(required)' : '(optional)'}</span>
          <input
            type="number"
            min={1}
            value={length}
            onChange={(e) => setLength(e.target.value)}
            placeholder="e.g. 255"
          />
        </label>
      )}
      {showLength && !lengthValid && (
        <p className="field__error">Length must be a positive whole number.</p>
      )}

      <label className="field field--checkbox">
        <input type="checkbox" checked={nullable} onChange={(e) => setNullable(e.target.checked)} />
        <span>Nullable</span>
      </label>
    </Modal>
  )
}
