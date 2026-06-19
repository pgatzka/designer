import { useEffect, useMemo, useRef, useState } from 'react'
import { Canvas } from './components/Canvas'
import { Editor } from './components/Editor'
import { ErrorBar } from './components/ErrorBar'
import { Explorer } from './components/Explorer'
import { NewDesignDialog } from './components/NewDesignDialog'
import { ImportDialog } from './components/ImportDialog'
import { useAuth } from './auth/AuthContext'
import {
  createDesign,
  deleteDesign,
  getDesign,
  importDesign,
  listDesigns,
  updateDesign,
  type Design,
  type DesignSummary,
  type ImportConnection,
} from './designs/api'
import { parse } from './schema/parse'
import { serialize } from './schema/serialize'
import { SEED_YAML } from './schema/seed'
import { getFlavor, type FlavorId } from './schema/flavors'
import { log } from './lib/log'
import type { Database, ParseError } from './schema/types'

const ACTIVE_KEY = 'designer:activeId'
const EMPTY_DB: Database = { schemas: [] }
/** New designs start with just an empty schema (no flavor-specific seed types). */
const NEW_DESIGN_DB: Database = { schemas: [{ name: 'public', tables: [] }] }

type SaveStatus = 'idle' | 'saving' | 'saved' | 'error'

const SAVE_LABEL: Record<SaveStatus, string> = {
  idle: '',
  saving: 'Saving…',
  saved: 'Saved',
  error: 'Save failed',
}

function summary(d: Design): DesignSummary {
  return {
    id: d.id,
    name: d.name,
    flavor: d.flavor,
    createdAt: d.createdAt,
    updatedAt: d.updatedAt,
  }
}

export default function App() {
  const { user, logout } = useAuth()

  const [designs, setDesigns] = useState<DesignSummary[]>([])
  const [activeId, setActiveId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle')

  const [text, setText] = useState('')
  const [errors, setErrors] = useState<ParseError[]>([])
  const [db, setDb] = useState<Database>(EMPTY_DB)
  const [newOpen, setNewOpen] = useState(false)
  const [importOpen, setImportOpen] = useState(false)
  const [banner, setBanner] = useState<string | null>(null)

  const parseTimer = useRef<number | undefined>(undefined)
  const saveTimer = useRef<number | undefined>(undefined)
  const nameTimer = useRef<number | undefined>(undefined)
  const lastSavedText = useRef('')
  const didInit = useRef(false)

  // Load a design's structure into the editor (canonical YAML), without triggering a save.
  function applyDesign(design: Design) {
    const yaml = serialize(design.database)
    lastSavedText.current = yaml
    setText(yaml)
    setActiveId(design.id)
    try {
      localStorage.setItem(ACTIVE_KEY, design.id)
    } catch {
      /* ignore */
    }
  }

  // Initial load: fetch designs, open the last-active (or first, or create a default).
  useEffect(() => {
    if (didInit.current) return
    didInit.current = true
    ;(async () => {
      try {
        let list = await listDesigns()
        const preferred = (() => {
          try {
            return localStorage.getItem(ACTIVE_KEY)
          } catch {
            return null
          }
        })()
        const target = list.find((d) => d.id === preferred) ?? list[0]
        if (target) {
          applyDesign(await getDesign(target.id))
        } else {
          const created = await createDesign('My first design', 'postgres', parse(SEED_YAML).db)
          list = [summary(created)]
          applyDesign(created)
        }
        setDesigns(list)
      } catch (e) {
        const m = e instanceof Error ? e.message : String(e)
        log.error('failed to load designs', { error: m })
        setBanner(`Could not load your designs: ${m}`)
        setSaveStatus('error')
      } finally {
        setLoading(false)
      }
    })()
  }, [])

  const activeFlavorId = designs.find((d) => d.id === activeId)?.flavor
  const activeFlavor = getFlavor(activeFlavorId)

  // Debounced parse for the canvas (keep last good diagram on errors).
  useEffect(() => {
    window.clearTimeout(parseTimer.current)
    parseTimer.current = window.setTimeout(() => {
      const result = parse(text, activeFlavorId)
      setErrors(result.errors)
      if (result.errors.length === 0) setDb(result.db)
    }, 150)
    return () => window.clearTimeout(parseTimer.current)
  }, [text, activeFlavorId])

  // Debounced autosave of the active design when the YAML parses cleanly.
  useEffect(() => {
    if (!activeId || text === lastSavedText.current) return
    window.clearTimeout(saveTimer.current)
    saveTimer.current = window.setTimeout(async () => {
      const result = parse(text, activeFlavorId)
      if (result.errors.length > 0) return // never persist an invalid structure
      const snapshot = text
      setSaveStatus('saving')
      try {
        const updated = await updateDesign(activeId, { database: result.db })
        lastSavedText.current = snapshot
        setSaveStatus('saved')
        setDesigns((prev) =>
          prev.map((d) => (d.id === activeId ? { ...d, updatedAt: updated.updatedAt } : d)),
        )
      } catch (e) {
        const m = e instanceof Error ? e.message : String(e)
        log.error('autosave failed', { error: m, designId: activeId })
        setBanner(`Could not save changes: ${m}`)
        setSaveStatus('error')
      }
    }, 1000)
    return () => window.clearTimeout(saveTimer.current)
  }, [text, activeId, activeFlavorId])

  const tableCount = useMemo(() => db.schemas.reduce((sum, s) => sum + s.tables.length, 0), [db])
  const activeName = designs.find((d) => d.id === activeId)?.name ?? ''

  async function handleSelect(id: string) {
    if (id === activeId || busy) return
    setBusy(true)
    setSaveStatus('idle')
    try {
      applyDesign(await getDesign(id))
    } catch {
      setSaveStatus('error')
    } finally {
      setBusy(false)
    }
  }

  async function handleCreate(name: string, flavor: FlavorId) {
    setNewOpen(false)
    setBusy(true)
    setBanner(null)
    try {
      const created = await createDesign(name, flavor, NEW_DESIGN_DB)
      setDesigns((prev) => [summary(created), ...prev])
      applyDesign(created)
      setSaveStatus('idle')
    } catch (e) {
      const m = e instanceof Error ? e.message : String(e)
      log.error('failed to create design', { error: m })
      setBanner(`Could not create the design: ${m}`)
      setSaveStatus('error')
    } finally {
      setBusy(false)
    }
  }

  // Import a schema from a live SQL connection into a new design. Errors propagate
  // back to the dialog (which stays open) so the user can correct and retry.
  async function handleImport(name: string, flavor: FlavorId, connection: ImportConnection) {
    setBusy(true)
    setBanner(null)
    try {
      const created = await importDesign(name, flavor, connection)
      setDesigns((prev) => [summary(created), ...prev])
      applyDesign(created)
      setSaveStatus('idle')
      setImportOpen(false)
    } finally {
      setBusy(false)
    }
  }

  async function handleDelete(id: string) {
    if (!window.confirm('Delete this design? This cannot be undone.')) return
    setBusy(true)
    try {
      await deleteDesign(id)
      const remaining = designs.filter((d) => d.id !== id)
      setDesigns(remaining)
      if (id === activeId) {
        if (remaining[0]) {
          applyDesign(await getDesign(remaining[0].id))
        } else {
          const created = await createDesign('My first design', 'postgres', parse(SEED_YAML).db)
          setDesigns([summary(created)])
          applyDesign(created)
        }
      }
    } catch (e) {
      const m = e instanceof Error ? e.message : String(e)
      log.error('failed to delete design', { error: m, designId: id })
      setBanner(`Could not delete the design: ${m}`)
      setSaveStatus('error')
    } finally {
      setBusy(false)
    }
  }

  function handleNameChange(name: string) {
    if (!activeId) return
    setDesigns((prev) => prev.map((d) => (d.id === activeId ? { ...d, name } : d)))
    window.clearTimeout(nameTimer.current)
    const id = activeId
    nameTimer.current = window.setTimeout(() => {
      updateDesign(id, { name }).catch(() => setSaveStatus('error'))
    }, 600)
  }

  if (loading) return <div className="app-loading">Loading your designs…</div>

  return (
    <div className="app">
      {banner && (
        <div className="app__error" role="alert">
          <span className="app__error-msg">{banner}</span>
          <button
            className="app__error-close"
            onClick={() => setBanner(null)}
            aria-label="Dismiss error"
          >
            ×
          </button>
        </div>
      )}
      <header className="app__header">
        <h1>Visual Database Designer</h1>
        <input
          className="app__designname"
          value={activeName}
          onChange={(e) => handleNameChange(e.target.value)}
          aria-label="Design name"
          spellCheck={false}
        />
        {activeFlavor && (
          <span className="app__flavor" title="Database flavor (fixed at creation)">
            {activeFlavor.label}
          </span>
        )}
        <span className={`app__save app__save--${saveStatus}`}>{SAVE_LABEL[saveStatus]}</span>
        <span className="app__meta">
          {db.schemas.length} schema{db.schemas.length === 1 ? '' : 's'} · {tableCount} table
          {tableCount === 1 ? '' : 's'}
        </span>
        <div className="app__user">
          {user && <span className="app__email">{user.email}</span>}
          <button className="app__logout" onClick={() => void logout()}>
            Log out
          </button>
        </div>
      </header>
      <div className="app__body">
        <Explorer
          designs={designs}
          activeId={activeId}
          busy={busy}
          onSelect={handleSelect}
          onNew={() => setNewOpen(true)}
          onImport={() => setImportOpen(true)}
          onDelete={handleDelete}
        />
        <section className="app__editor">
          <Editor value={text} onChange={setText} />
        </section>
        <section className="app__canvas">
          <Canvas db={db} flavor={activeFlavor} onChange={(next) => setText(serialize(next))} />
          <ErrorBar errors={errors} />
        </section>
      </div>
      {newOpen && <NewDesignDialog onCancel={() => setNewOpen(false)} onSubmit={handleCreate} />}
      {importOpen && <ImportDialog onCancel={() => setImportOpen(false)} onImport={handleImport} />}
    </div>
  )
}
