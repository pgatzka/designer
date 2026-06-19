import type { ConnectionConfig, Logger, RawSchema, SchemaInspector } from '../../designs/types'
import { inspectPostgres } from './pg'
import { inspectMysql } from './mysql'
import { inspectSqlServer } from './sqlserver'

/**
 * Real {@link SchemaInspector} that connects to a source database using the
 * driver for the chosen flavor. Lazy — it only connects when {@link inspect} is
 * called, so constructing it (e.g. in `buildApp`) is free.
 */
export class DriverSchemaInspector implements SchemaInspector {
  inspect(conn: ConnectionConfig, logger?: Logger): Promise<RawSchema> {
    switch (conn.flavor) {
      case 'postgres':
        return inspectPostgres(conn, logger)
      case 'mysql':
        return inspectMysql(conn, logger)
      case 'sqlserver':
        return inspectSqlServer(conn, logger)
    }
  }
}
