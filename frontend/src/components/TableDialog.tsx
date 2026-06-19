import { useState } from 'react'
import { Modal } from './Modal'

interface TableDialogProps {
  mode: 'add' | 'rename'
  schemas: string[]
  defaultSchema: string
  /** Existing table names keyed by schema, for duplicate detection. */
  tablesBySchema: Record<string, string[]>
  initialName?: string
  onCancel: () => void
  onSubmit: (result: { name: string; schema: string }) => void
}

export function TableDialog({
  mode,
  schemas,
  defaultSchema,
  tablesBySchema,
  initialName,
  onCancel,
  onSubmit,
}: TableDialogProps) {
  const [name, setName] = useState(initialName ?? '')
  const [schema, setSchema] = useState(defaultSchema)

  const trimmedName = name.trim()
  const trimmedSchema = schema.trim()
  const existing = tablesBySchema[trimmedSchema] ?? []
  const duplicate =
    existing.includes(trimmedName) && !(mode === 'rename' && trimmedName === initialName)
  const valid = trimmedName.length > 0 && trimmedSchema.length > 0 && !duplicate

  return (
    <Modal
      title={mode === 'add' ? 'Add table' : 'Rename table'}
      onCancel={onCancel}
      onSubmit={() => valid && onSubmit({ name: trimmedName, schema: trimmedSchema })}
      submitDisabled={!valid}
    >
      <label className="field">
        <span>Table name</span>
        <input
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          spellCheck={false}
        />
      </label>
      {mode === 'add' && (
        <label className="field">
          <span>Schema</span>
          <input
            list="schema-options"
            value={schema}
            onChange={(e) => setSchema(e.target.value)}
            spellCheck={false}
          />
          <datalist id="schema-options">
            {schemas.map((s) => (
              <option key={s} value={s} />
            ))}
          </datalist>
        </label>
      )}
      {duplicate && (
        <p className="field__error">
          “{trimmedSchema}” already has a table named “{trimmedName}”.
        </p>
      )}
    </Modal>
  )
}
