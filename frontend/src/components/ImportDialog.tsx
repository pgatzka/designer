import { useState } from 'react'
import { Modal } from './Modal'
import { FLAVORS, type FlavorId } from '../schema/flavors'
import type { ImportConnection } from '../designs/api'

interface ImportDialogProps {
  onCancel: () => void
  /** Performs the import; resolves on success (dialog closes), rejects to show the error. */
  onImport: (name: string, flavor: FlavorId, connection: ImportConnection) => Promise<void>
}

const FLAVOR_IDS = Object.keys(FLAVORS) as FlavorId[]
const DEFAULT_PORT: Record<FlavorId, number> = { postgres: 5432, mysql: 3306, sqlserver: 1433 }

/**
 * Imports a schema from a live SQL connection into a new design. Owns its own
 * submitting/error state: it stays open (showing the server error) until the
 * import succeeds. Credentials are sent only with the request, never stored.
 */
export function ImportDialog({ onCancel, onImport }: ImportDialogProps) {
  const [name, setName] = useState('Imported design')
  const [flavor, setFlavor] = useState<FlavorId>('postgres')
  const [host, setHost] = useState('localhost')
  const [port, setPort] = useState(String(DEFAULT_PORT.postgres))
  const [database, setDatabase] = useState('')
  const [user, setUser] = useState('')
  const [password, setPassword] = useState('')
  const [ssl, setSsl] = useState(false)

  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const portNum = Number(port)
  const portValid = Number.isInteger(portNum) && portNum > 0
  const valid =
    name.trim().length > 0 &&
    host.trim().length > 0 &&
    database.trim().length > 0 &&
    user.trim().length > 0 &&
    portValid

  function chooseFlavor(id: FlavorId) {
    setFlavor(id)
    // Track the conventional port for the chosen engine unless the user customized it.
    if (Object.values(DEFAULT_PORT).map(String).includes(port)) setPort(String(DEFAULT_PORT[id]))
  }

  async function submit() {
    if (!valid || submitting) return
    setSubmitting(true)
    setError(null)
    try {
      await onImport(name.trim(), flavor, {
        host: host.trim(),
        port: portNum,
        database: database.trim(),
        user: user.trim(),
        password,
        ssl,
      })
    } catch (e) {
      setError((e as Error).message || 'Import failed')
      setSubmitting(false)
    }
  }

  return (
    <Modal
      title="Import from a database"
      submitLabel={submitting ? 'Importing…' : 'Import'}
      submitDisabled={!valid || submitting}
      onCancel={onCancel}
      onSubmit={submit}
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
        <select value={flavor} onChange={(e) => chooseFlavor(e.target.value as FlavorId)}>
          {FLAVOR_IDS.map((id) => (
            <option key={id} value={id}>
              {FLAVORS[id].label}
            </option>
          ))}
        </select>
      </label>

      <div className="field-row">
        <label className="field field--grow">
          <span>Host</span>
          <input value={host} onChange={(e) => setHost(e.target.value)} spellCheck={false} />
        </label>
        <label className="field field--port">
          <span>Port</span>
          <input type="number" min={1} value={port} onChange={(e) => setPort(e.target.value)} />
        </label>
      </div>

      <label className="field">
        <span>Database</span>
        <input value={database} onChange={(e) => setDatabase(e.target.value)} spellCheck={false} />
      </label>
      <label className="field">
        <span>User</span>
        <input value={user} onChange={(e) => setUser(e.target.value)} spellCheck={false} />
      </label>
      <label className="field">
        <span>Password</span>
        <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
      </label>
      <label className="field field--checkbox">
        <input type="checkbox" checked={ssl} onChange={(e) => setSsl(e.target.checked)} />
        <span>Use SSL</span>
      </label>

      <p className="field__hint">
        Credentials are used only to read the schema and are not stored.
      </p>
      {error && <p className="field__error">{error}</p>}
    </Modal>
  )
}
