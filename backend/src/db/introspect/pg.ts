import { Pool } from 'pg'
import type {
  ConnectionConfig,
  Logger,
  RawColumn,
  RawConstraint,
  RawForeignKey,
  RawSchema,
} from '../../designs/types'

const SYSTEM_SCHEMAS = `('pg_catalog', 'information_schema', 'pg_toast')`

/** Introspect a PostgreSQL database into a flavor-agnostic {@link RawSchema}. */
export async function inspectPostgres(conn: ConnectionConfig, logger?: Logger): Promise<RawSchema> {
  const where = { host: conn.host, port: conn.port, database: conn.database, user: conn.user }
  logger?.info(where, 'postgres: connecting')
  const pool = new Pool({
    host: conn.host,
    port: conn.port,
    database: conn.database,
    user: conn.user,
    password: conn.password,
    ssl: conn.ssl ? { rejectUnauthorized: false } : undefined,
    connectionTimeoutMillis: 10_000,
    max: 2,
  })

  try {
    logger?.debug(where, 'postgres: querying columns')
    const columns = await pool.query<{
      schema: string
      table: string
      name: string
      data_type: string
      char_max_length: number | null
      nullable: string
      position: number
    }>(
      `SELECT table_schema AS schema, table_name AS table, column_name AS name,
              data_type, character_maximum_length AS char_max_length,
              is_nullable AS nullable, ordinal_position AS position
       FROM information_schema.columns
       WHERE table_schema NOT IN ${SYSTEM_SCHEMAS}
       ORDER BY table_schema, table_name, ordinal_position`,
    )

    // Primary-key and unique constraints, with their ordered columns.
    logger?.debug(where, 'postgres: querying constraints')
    const keys = await pool.query<{
      schema: string
      table: string
      name: string
      type: string
      column: string
    }>(
      `SELECT tc.table_schema AS schema, tc.table_name AS table,
              tc.constraint_name AS name, tc.constraint_type AS type,
              kcu.column_name AS column
       FROM information_schema.table_constraints tc
       JOIN information_schema.key_column_usage kcu
         ON kcu.constraint_name = tc.constraint_name
        AND kcu.table_schema = tc.table_schema
       WHERE tc.constraint_type IN ('PRIMARY KEY', 'UNIQUE')
         AND tc.table_schema NOT IN ${SYSTEM_SCHEMAS}
       ORDER BY tc.constraint_name, kcu.ordinal_position`,
    )

    // Foreign keys, with ordered source and target columns.
    logger?.debug(where, 'postgres: querying foreign keys')
    const fks = await pool.query<{
      schema: string
      table: string
      name: string
      column: string
      target_schema: string
      target_table: string
      target_column: string
    }>(
      `SELECT tc.table_schema AS schema, tc.table_name AS table,
              tc.constraint_name AS name, kcu.column_name AS column,
              ccu.table_schema AS target_schema, ccu.table_name AS target_table,
              ccu.column_name AS target_column
       FROM information_schema.table_constraints tc
       JOIN information_schema.key_column_usage kcu
         ON kcu.constraint_name = tc.constraint_name AND kcu.table_schema = tc.table_schema
       JOIN information_schema.constraint_column_usage ccu
         ON ccu.constraint_name = tc.constraint_name AND ccu.table_schema = tc.table_schema
       WHERE tc.constraint_type = 'FOREIGN KEY'
         AND tc.table_schema NOT IN ${SYSTEM_SCHEMAS}
       ORDER BY tc.constraint_name, kcu.ordinal_position`,
    )

    // Secondary (non-unique, non-primary) indexes via the catalog.
    logger?.debug(where, 'postgres: querying indexes')
    const indexes = await pool.query<{
      schema: string
      table: string
      name: string
      column: string
      ord: number
    }>(
      `SELECT n.nspname AS schema, t.relname AS table, i.relname AS name,
              a.attname AS column, x.ord AS ord
       FROM pg_index ix
       JOIN pg_class i ON i.oid = ix.indexrelid
       JOIN pg_class t ON t.oid = ix.indrelid
       JOIN pg_namespace n ON n.oid = t.relnamespace
       JOIN LATERAL unnest(ix.indkey) WITH ORDINALITY AS x(attnum, ord) ON true
       JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = x.attnum
       WHERE NOT ix.indisunique AND NOT ix.indisprimary
         AND n.nspname NOT IN ${SYSTEM_SCHEMAS}
       ORDER BY i.relname, x.ord`,
    )

    const result: RawSchema = {
      columns: columns.rows.map(
        (r): RawColumn => ({
          schema: r.schema,
          table: r.table,
          name: r.name,
          dataType: r.data_type,
          charMaxLength: r.char_max_length ?? undefined,
          nullable: r.nullable === 'YES',
          position: r.position,
        }),
      ),
      constraints: [
        ...groupConstraints(
          keys.rows.map((r) => ({
            schema: r.schema,
            table: r.table,
            name: r.name,
            type: r.type === 'PRIMARY KEY' ? 'primary-key' : 'unique',
            column: r.column,
          })),
        ),
        ...groupConstraints(
          indexes.rows.map((r) => ({
            schema: r.schema,
            table: r.table,
            name: r.name,
            type: 'index' as const,
            column: r.column,
          })),
        ),
      ],
      foreignKeys: groupForeignKeys(fks.rows),
    }
    logger?.info(
      {
        ...where,
        columns: result.columns.length,
        constraints: result.constraints.length,
        foreignKeys: result.foreignKeys.length,
      },
      'postgres: introspection complete',
    )
    return result
  } catch (err) {
    logger?.error({ err, ...where }, 'postgres: introspection failed')
    throw err
  } finally {
    await pool.end()
  }
}

/** Collapse per-column constraint rows into one {@link RawConstraint} each. */
export function groupConstraints(
  rows: Array<{
    schema: string
    table: string
    name: string
    type: RawConstraint['type']
    column: string
  }>,
): RawConstraint[] {
  const byName = new Map<string, RawConstraint>()
  for (const r of rows) {
    const id = `${r.schema}.${r.table}.${r.name}`
    let c = byName.get(id)
    if (!c) {
      c = { schema: r.schema, table: r.table, name: r.name, type: r.type, columns: [] }
      byName.set(id, c)
    }
    c.columns.push(r.column)
  }
  return [...byName.values()]
}

/** Collapse per-column FK rows into one {@link RawForeignKey} each. */
export function groupForeignKeys(
  rows: Array<{
    schema: string
    table: string
    name: string
    column: string
    target_schema: string
    target_table: string
    target_column: string
  }>,
): RawForeignKey[] {
  const byName = new Map<string, RawForeignKey>()
  for (const r of rows) {
    const id = `${r.schema}.${r.table}.${r.name}`
    let fk = byName.get(id)
    if (!fk) {
      fk = {
        schema: r.schema,
        table: r.table,
        name: r.name,
        columns: [],
        targetSchema: r.target_schema,
        targetTable: r.target_table,
        targetColumns: [],
      }
      byName.set(id, fk)
    }
    fk.columns.push(r.column)
    fk.targetColumns.push(r.target_column)
  }
  return [...byName.values()]
}
