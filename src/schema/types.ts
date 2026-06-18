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
  /** Target table name (may be schema-qualified as "schema.table"). */
  targetTable: string
  targetColumns: string[]
}

export interface Table {
  schema: string
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

export interface ParseError {
  /** Dotted path to the offending node, e.g. "database.schemas.public.tables.user". */
  path: string
  message: string
}

export interface ParseResult {
  db: Database
  errors: ParseError[]
}
