import { createConnection, type RowDataPacket } from 'mysql2/promise'
import type { ConnectionConfig, Logger, RawColumn, RawSchema } from '../../designs/types'
import { groupConstraints, groupForeignKeys } from './pg'

/**
 * Introspect a MySQL database into a {@link RawSchema}. In MySQL a "schema" is a
 * database, so the connected `database` becomes the single schema namespace.
 */
export async function inspectMysql(conn: ConnectionConfig, logger?: Logger): Promise<RawSchema> {
  const db = conn.database
  const where = { host: conn.host, port: conn.port, database: db, user: conn.user }
  logger?.info(where, 'mysql: connecting')
  const connection = await createConnection({
    host: conn.host,
    port: conn.port,
    database: db,
    user: conn.user,
    password: conn.password,
    ssl: conn.ssl ? { rejectUnauthorized: false } : undefined,
    connectTimeout: 10_000,
  })

  try {
    logger?.debug(where, 'mysql: querying columns')
    const [cols] = await connection.query<RowDataPacket[]>(
      `SELECT table_name AS \`table\`, column_name AS name, data_type AS dataType,
              character_maximum_length AS charMaxLength, is_nullable AS nullable,
              ordinal_position AS position
       FROM information_schema.columns
       WHERE table_schema = ?
       ORDER BY table_name, ordinal_position`,
      [db],
    )

    logger?.debug(where, 'mysql: querying indexes/constraints')
    const [keys] = await connection.query<RowDataPacket[]>(
      `SELECT table_name AS \`table\`, index_name AS name, non_unique, column_name AS \`column\`
       FROM information_schema.statistics
       WHERE table_schema = ?
       ORDER BY index_name, seq_in_index`,
      [db],
    )

    logger?.debug(where, 'mysql: querying foreign keys')
    const [fks] = await connection.query<RowDataPacket[]>(
      `SELECT table_name AS \`table\`, constraint_name AS name, column_name AS \`column\`,
              referenced_table_schema AS target_schema, referenced_table_name AS target_table,
              referenced_column_name AS target_column
       FROM information_schema.key_column_usage
       WHERE table_schema = ? AND referenced_table_name IS NOT NULL
       ORDER BY constraint_name, ordinal_position`,
      [db],
    )

    const result: RawSchema = {
      columns: cols.map(
        (r): RawColumn => ({
          schema: db,
          table: r.table,
          name: r.name,
          dataType: r.dataType,
          charMaxLength: r.charMaxLength == null ? undefined : Number(r.charMaxLength),
          nullable: r.nullable === 'YES',
          position: Number(r.position),
        }),
      ),
      constraints: groupConstraints(
        keys.map((r) => ({
          schema: db,
          table: r.table,
          name: r.name,
          type:
            r.name === 'PRIMARY'
              ? ('primary-key' as const)
              : Number(r.non_unique) === 0
                ? ('unique' as const)
                : ('index' as const),
          column: r.column,
        })),
      ),
      foreignKeys: groupForeignKeys(
        fks.map((r) => ({
          schema: db,
          table: r.table,
          name: r.name,
          column: r.column,
          target_schema: r.target_schema,
          target_table: r.target_table,
          target_column: r.target_column,
        })),
      ),
    }
    logger?.info(
      {
        ...where,
        columns: result.columns.length,
        constraints: result.constraints.length,
        foreignKeys: result.foreignKeys.length,
      },
      'mysql: introspection complete',
    )
    return result
  } catch (err) {
    logger?.error({ err, ...where }, 'mysql: introspection failed')
    throw err
  } finally {
    await connection.end()
  }
}
