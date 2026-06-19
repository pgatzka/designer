import { Pool } from 'pg'
import type { Logger } from '../designs/types'

export function createPool(databaseUrl: string, logger?: Logger): Pool {
  const pool = new Pool({ connectionString: databaseUrl })
  // Surface unexpected errors on idle clients instead of crashing silently.
  pool.on('error', (err) => logger?.error({ err }, 'postgres pool error (idle client)'))
  return pool
}
