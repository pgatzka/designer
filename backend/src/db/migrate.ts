import type { Pool } from 'pg'

// gen_random_uuid() is built into PostgreSQL 13+.
const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email         text UNIQUE NOT NULL,
  password_hash text NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now()
);
`

/** Apply the (idempotent) database schema. Safe to run on every startup. */
export async function migrate(pool: Pool): Promise<void> {
  await pool.query(SCHEMA)
}
