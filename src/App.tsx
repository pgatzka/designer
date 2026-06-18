import { useEffect, useMemo, useRef, useState } from 'react'
import { Canvas } from './components/Canvas'
import { Editor } from './components/Editor'
import { ErrorBar } from './components/ErrorBar'
import { parse } from './schema/parse'
import { SEED_YAML } from './schema/seed'
import type { Database, ParseError } from './schema/types'

const STORAGE_KEY = 'designer:yaml'
const EMPTY_DB: Database = { schemas: [] }

function loadInitial(): string {
  try {
    return localStorage.getItem(STORAGE_KEY) ?? SEED_YAML
  } catch {
    return SEED_YAML
  }
}

export default function App() {
  const [text, setText] = useState<string>(loadInitial)
  const [errors, setErrors] = useState<ParseError[]>([])
  // The last schema that parsed cleanly — kept on screen while the user types
  // through transient errors.
  const [db, setDb] = useState<Database>(EMPTY_DB)
  const debounce = useRef<number | undefined>(undefined)

  // Debounced parse + persist on every edit.
  useEffect(() => {
    window.clearTimeout(debounce.current)
    debounce.current = window.setTimeout(() => {
      const result = parse(text)
      setErrors(result.errors)
      if (result.errors.length === 0) setDb(result.db)
      try {
        localStorage.setItem(STORAGE_KEY, text)
      } catch {
        /* ignore quota / unavailable storage */
      }
    }, 150)
    return () => window.clearTimeout(debounce.current)
  }, [text])

  const tableCount = useMemo(
    () => db.schemas.reduce((sum, s) => sum + s.tables.length, 0),
    [db],
  )

  return (
    <div className="app">
      <header className="app__header">
        <h1>Visual Database Designer</h1>
        <span className="app__meta">
          {db.schemas.length} schema{db.schemas.length === 1 ? '' : 's'} · {tableCount} table
          {tableCount === 1 ? '' : 's'}
        </span>
      </header>
      <div className="app__body">
        <section className="app__editor">
          <Editor value={text} onChange={setText} />
        </section>
        <section className="app__canvas">
          <Canvas db={db} />
          <ErrorBar errors={errors} />
        </section>
      </div>
    </div>
  )
}
