import yaml from 'js-yaml'
import type { Database } from './types'

/**
 * Serialize a {@link Database} back into canonical block-style YAML — the inverse of
 * {@link ./parse.parse}. Used to populate the editor when a saved design is loaded.
 * `parse(serialize(db))` reproduces the same `Database`.
 */
export function serialize(db: Database): string {
  const schemas: Record<string, unknown> = {}

  for (const schema of db.schemas) {
    const tables: Record<string, unknown> = {}

    for (const table of schema.tables) {
      const columns: Record<string, unknown> = {}
      for (const col of table.columns) {
        const c: Record<string, unknown> = { type: col.type }
        if (col.length != null) c.length = col.length
        if (!col.nullable) c.nullable = false // default is true; only emit when false
        columns[col.name] = c
      }

      const t: Record<string, unknown> = { columns }

      if (table.constraints.length > 0) {
        const constraints: Record<string, unknown> = {}
        for (const con of table.constraints) {
          constraints[con.name] = { type: con.type, columns: con.columns }
        }
        t.constraints = constraints
      }

      if (table.foreignKeys.length > 0) {
        const fks: Record<string, unknown> = {}
        for (const fk of table.foreignKeys) {
          fks[fk.name] = {
            'source-columns': fk.sourceColumns,
            table: fk.targetTable,
            'target-columns': fk.targetColumns,
          }
        }
        t['foreign-keys'] = fks
      }

      tables[table.name] = t
    }

    schemas[schema.name] = { tables }
  }

  return yaml.dump(
    { database: { schemas } },
    { indent: 2, lineWidth: -1, noRefs: true, sortKeys: false },
  )
}
