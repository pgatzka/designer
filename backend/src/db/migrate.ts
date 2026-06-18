import type { Pool } from 'pg'

// gen_random_uuid() is built into PostgreSQL 13+.
const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email         text UNIQUE NOT NULL,
  password_hash text NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS designs (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name       text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_designs_user ON designs(user_id);

-- A design's parsed structure, stored normalized (not as a YAML blob).
CREATE TABLE IF NOT EXISTS design_schemas (
  id        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  design_id uuid NOT NULL REFERENCES designs(id) ON DELETE CASCADE,
  name      text NOT NULL,
  position  int  NOT NULL
);

CREATE TABLE IF NOT EXISTS design_tables (
  id        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  schema_id uuid NOT NULL REFERENCES design_schemas(id) ON DELETE CASCADE,
  name      text NOT NULL,
  position  int  NOT NULL
);

CREATE TABLE IF NOT EXISTS design_columns (
  id       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  table_id uuid NOT NULL REFERENCES design_tables(id) ON DELETE CASCADE,
  name     text NOT NULL,
  type     text NOT NULL,
  length   int,
  nullable boolean NOT NULL,
  position int  NOT NULL
);

CREATE TABLE IF NOT EXISTS design_constraints (
  id       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  table_id uuid NOT NULL REFERENCES design_tables(id) ON DELETE CASCADE,
  name     text NOT NULL,
  type     text NOT NULL,
  columns  text[] NOT NULL DEFAULT '{}',
  position int  NOT NULL
);

CREATE TABLE IF NOT EXISTS design_foreign_keys (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  table_id       uuid NOT NULL REFERENCES design_tables(id) ON DELETE CASCADE,
  name           text NOT NULL,
  target_table   text NOT NULL,
  source_columns text[] NOT NULL DEFAULT '{}',
  target_columns text[] NOT NULL DEFAULT '{}',
  position       int  NOT NULL
);
`

/** Apply the (idempotent) database schema. Safe to run on every startup. */
export async function migrate(pool: Pool): Promise<void> {
  await pool.query(SCHEMA)
}
