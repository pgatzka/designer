/** Parsed database structure — the persisted, normalized model (not YAML). */
export type ConstraintType = 'primary-key' | 'unique' | 'index'

export interface Column {
  name: string
  type: string
  length?: number
  nullable: boolean
}

export interface Constraint {
  name: string
  type: ConstraintType
  columns: string[]
}

export interface ForeignKey {
  name: string
  sourceColumns: string[]
  targetTable: string
  targetColumns: string[]
}

export interface Table {
  name: string
  columns: Column[]
  constraints: Constraint[]
  foreignKeys: ForeignKey[]
}

export interface SchemaNs {
  name: string
  tables: Table[]
}

export interface Database {
  schemas: SchemaNs[]
}

export type FlavorId = 'postgres' | 'mysql' | 'sqlserver'

export interface DesignSummary {
  id: string
  name: string
  flavor: FlavorId
  createdAt: string
  updatedAt: string
}

export interface Design extends DesignSummary {
  database: Database
}

/** Persistence boundary for designs (injected so logic is testable without a DB). */
export interface DesignRepository {
  listByUser(userId: string): Promise<DesignSummary[]>
  create(userId: string, name: string, flavor: FlavorId, database: Database): Promise<Design>
  get(userId: string, id: string): Promise<Design | null>
  update(
    userId: string,
    id: string,
    patch: { name?: string; database?: Database },
  ): Promise<Design | null>
  remove(userId: string, id: string): Promise<boolean>
}

// ---- Schema import (live SQL connection) -----------------------------------

/** Connection details for an import; used transiently and never persisted. */
export interface ConnectionConfig {
  flavor: FlavorId
  host: string
  port: number
  database: string
  user: string
  password: string
  ssl?: boolean
}

/**
 * Flavor-agnostic introspection result. Inspectors fill these flat lists from a
 * source database's catalog; {@link Database} is then assembled from them.
 */
export interface RawColumn {
  schema: string
  table: string
  name: string
  dataType: string
  charMaxLength?: number
  nullable: boolean
  position: number
}

export interface RawConstraint {
  schema: string
  table: string
  name: string
  type: ConstraintType
  columns: string[]
}

export interface RawForeignKey {
  schema: string
  table: string
  name: string
  columns: string[]
  targetSchema: string
  targetTable: string
  targetColumns: string[]
}

export interface RawSchema {
  columns: RawColumn[]
  constraints: RawConstraint[]
  foreignKeys: RawForeignKey[]
}

/** Connects to a source database and introspects its schema (injected for tests). */
export interface SchemaInspector {
  inspect(conn: ConnectionConfig, logger?: Logger): Promise<RawSchema>
}

/**
 * Minimal structured-logging surface satisfied by both pino and Fastify's
 * `request.log`, so modules can log without depending on pino's types.
 */
export interface Logger {
  info(obj: unknown, msg?: string): void
  warn(obj: unknown, msg?: string): void
  error(obj: unknown, msg?: string): void
  debug(obj: unknown, msg?: string): void
}
