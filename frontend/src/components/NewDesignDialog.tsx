import { useState } from 'react'
import { Modal } from './Modal'
import { FLAVORS, type FlavorId } from '../schema/flavors'

interface NewDesignDialogProps {
  onCancel: () => void
  onSubmit: (name: string, flavor: FlavorId) => void
}

const FLAVOR_IDS = Object.keys(FLAVORS) as FlavorId[]

/**
 * Collects the name and database flavor for a new design. The flavor is chosen
 * here once — it cannot be changed after the design is created.
 */
export function NewDesignDialog({ onCancel, onSubmit }: NewDesignDialogProps) {
  const [name, setName] = useState('Untitled design')
  const [flavor, setFlavor] = useState<FlavorId>('postgres')

  const trimmed = name.trim()
  const valid = trimmed.length > 0

  return (
    <Modal
      title="New design"
      submitLabel="Create"
      submitDisabled={!valid}
      onCancel={onCancel}
      onSubmit={() => valid && onSubmit(trimmed, flavor)}
    >
      <label className="field">
        <span>Name</span>
        <input
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          spellCheck={false}
        />
      </label>
      <label className="field">
        <span>Database flavor</span>
        <select value={flavor} onChange={(e) => setFlavor(e.target.value as FlavorId)}>
          {FLAVOR_IDS.map((id) => (
            <option key={id} value={id}>
              {FLAVORS[id].label}
            </option>
          ))}
        </select>
      </label>
      <p className="field__hint">The flavor is fixed once the design is created.</p>
    </Modal>
  )
}
