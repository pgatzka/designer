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

export interface DesignSummary {
  id: string
  name: string
  createdAt: string
  updatedAt: string
}

export interface Design extends DesignSummary {
  database: Database
}

/** Persistence boundary for designs (injected so logic is testable without a DB). */
export interface DesignRepository {
  listByUser(userId: string): Promise<DesignSummary[]>
  create(userId: string, name: string, database: Database): Promise<Design>
  get(userId: string, id: string): Promise<Design | null>
  update(
    userId: string,
    id: string,
    patch: { name?: string; database?: Database },
  ): Promise<Design | null>
  remove(userId: string, id: string): Promise<boolean>
}
