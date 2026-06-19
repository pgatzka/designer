import * as sql from 'mssql'
import type { ConnectionConfig, Logger, RawColumn, RawSchema } from '../../designs/types'
import { groupConstraints, groupForeignKeys } from './pg'

const SYSTEM_SCHEMAS = `('sys', 'INFORMATION_SCHEMA')`

/** Introspect a SQL Server database into a flavor-agnostic {@link RawSchema}. */
export async function inspectSqlServer(
  conn: ConnectionConfig,
  logger?: Logger,
): Promise<RawSchema> {
  const where = { host: conn.host, port: conn.port, database: conn.database, user: conn.user }
  logger?.info(where, 'sqlserver: connecting')
  const pool = new sql.ConnectionPool({
    server: conn.host,
    port: conn.port,
    database: conn.database,
    user: conn.user,
    password: conn.password,
    connectionTimeout: 10_000,
    requestTimeout: 10_000,
    options: { encrypt: !!conn.ssl, trustServerCertificate: true },
  })
  await pool.connect()

  try {
    logger?.debug(where, 'sqlserver: querying columns')
    const columns = await pool.request().query(
      `SELECT TABLE_SCHEMA AS [schema], TABLE_NAME AS [table], COLUMN_NAME AS name,
              DATA_TYPE AS dataType, CHARACTER_MAXIMUM_LENGTH AS charMaxLength,
              IS_NULLABLE AS nullable, ORDINAL_POSITION AS position
       FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA NOT IN ${SYSTEM_SCHEMAS}
       ORDER BY TABLE_SCHEMA, TABLE_NAME, ORDINAL_POSITION`,
    )

    logger?.debug(where, 'sqlserver: querying constraints')
    const keys = await pool.request().query(
      `SELECT tc.TABLE_SCHEMA AS [schema], tc.TABLE_NAME AS [table],
              tc.CONSTRAINT_NAME AS name, tc.CONSTRAINT_TYPE AS type, kcu.COLUMN_NAME AS [column]
       FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS tc
       JOIN INFORMATION_SCHEMA.KEY_COLUMN_USAGE kcu
         ON kcu.CONSTRAINT_NAME = tc.CONSTRAINT_NAME
        AND kcu.TABLE_SCHEMA = tc.TABLE_SCHEMA AND kcu.TABLE_NAME = tc.TABLE_NAME
       WHERE tc.CONSTRAINT_TYPE IN ('PRIMARY KEY', 'UNIQUE')
         AND tc.TABLE_SCHEMA NOT IN ${SYSTEM_SCHEMAS}
       ORDER BY tc.CONSTRAINT_NAME, kcu.ORDINAL_POSITION`,
    )

    logger?.debug(where, 'sqlserver: querying foreign keys')
    const fks = await pool.request().query(
      `SELECT fk.name AS name, sch.name AS [schema], tp.name AS [table], cp.name AS [column],
              rsch.name AS target_schema, rt.name AS target_table, cr.name AS target_column
       FROM sys.foreign_keys fk
       JOIN sys.foreign_key_columns fkc ON fkc.constraint_object_id = fk.object_id
       JOIN sys.tables tp ON tp.object_id = fkc.parent_object_id
       JOIN sys.schemas sch ON sch.schema_id = tp.schema_id
       JOIN sys.columns cp ON cp.object_id = fkc.parent_object_id AND cp.column_id = fkc.parent_column_id
       JOIN sys.tables rt ON rt.object_id = fkc.referenced_object_id
       JOIN sys.schemas rsch ON rsch.schema_id = rt.schema_id
       JOIN sys.columns cr ON cr.object_id = fkc.referenced_object_id AND cr.column_id = fkc.referenced_column_id
       ORDER BY fk.name, fkc.constraint_column_id`,
    )

    logger?.debug(where, 'sqlserver: querying indexes')
    const indexes = await pool.request().query(
      `SELECT sch.name AS [schema], t.name AS [table], i.name AS name, c.name AS [column]
       FROM sys.indexes i
       JOIN sys.tables t ON t.object_id = i.object_id
       JOIN sys.schemas sch ON sch.schema_id = t.schema_id
       JOIN sys.index_columns ic ON ic.object_id = i.object_id AND ic.index_id = i.index_id
       JOIN sys.columns c ON c.object_id = ic.object_id AND c.column_id = ic.column_id
       WHERE i.is_unique = 0 AND i.is_primary_key = 0 AND i.type > 0 AND ic.is_included_column = 0
       ORDER BY i.name, ic.key_ordinal`,
    )

    const result: RawSchema = {
      columns: (columns.recordset as RawColumnRow[]).map(
        (r): RawColumn => ({
          schema: r.schema,
          table: r.table,
          name: r.name,
          dataType: r.dataType,
          charMaxLength: r.charMaxLength == null ? undefined : Number(r.charMaxLength),
          nullable: r.nullable === 'YES',
          position: Number(r.position),
        }),
      ),
      constraints: [
        ...groupConstraints(
          (keys.recordset as KeyRow[]).map((r) => ({
            schema: r.schema,
            table: r.table,
            name: r.name,
            type: r.type === 'PRIMARY KEY' ? ('primary-key' as const) : ('unique' as const),
            column: r.column,
          })),
        ),
        ...groupConstraints(
          (indexes.recordset as IndexRow[]).map((r) => ({
            schema: r.schema,
            table: r.table,
            name: r.name,
            type: 'index' as const,
            column: r.column,
          })),
        ),
      ],
      foreignKeys: groupForeignKeys(fks.recordset as FkRow[]),
    }
    logger?.info(
      {
        ...where,
        columns: result.columns.length,
        constraints: result.constraints.length,
        foreignKeys: result.foreignKeys.length,
      },
      'sqlserver: introspection complete',
    )
    return result
  } catch (err) {
    logger?.error({ err, ...where }, 'sqlserver: introspection failed')
    throw err
  } finally {
    await pool.close()
  }
}

interface RawColumnRow {
  schema: string
  table: string
  name: string
  dataType: string
  charMaxLength: number | null
  nullable: string
  position: number
}
interface KeyRow {
  schema: string
  table: string
  name: string
  type: string
  column: string
}
interface IndexRow {
  schema: string
  table: string
  name: string
  column: string
}
interface FkRow {
  schema: string
  table: string
  name: string
  column: string
  target_schema: string
  target_table: string
  target_column: string
}
