import type { ConnectionConfig, RawSchema, SchemaInspector } from '../../designs/types'
import { inspectPostgres } from './pg'
import { inspectMysql } from './mysql'
import { inspectSqlServer } from './sqlserver'

/**
 * Real {@link SchemaInspector} that connects to a source database using the
 * driver for the chosen flavor. Lazy — it only connects when {@link inspect} is
 * called, so constructing it (e.g. in `buildApp`) is free.
 */
export class DriverSchemaInspector implements SchemaInspector {
  inspect(conn: ConnectionConfig): Promise<RawSchema> {
    switch (conn.flavor) {
      case 'postgres':
        return inspectPostgres(conn)
      case 'mysql':
        return inspectMysql(conn)
      case 'sqlserver':
        return inspectSqlServer(conn)
    }
  }
}
