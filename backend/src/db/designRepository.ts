import type { Pool, PoolClient } from 'pg'
import type {
  Constraint,
  ConstraintType,
  Database,
  Design,
  DesignRepository,
  DesignSummary,
  ForeignKey,
  SchemaNs,
  Table,
} from '../designs/types'

interface DesignRow {
  id: string
  name: string
  created_at: Date
  updated_at: Date
}

function toSummary(row: DesignRow): DesignSummary {
  return {
    id: row.id,
    name: row.name,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  }
}

export class PgDesignRepository implements DesignRepository {
  constructor(private readonly pool: Pool) {}

  async listByUser(userId: string): Promise<DesignSummary[]> {
    const res = await this.pool.query<DesignRow>(
      'SELECT id, name, created_at, updated_at FROM designs WHERE user_id = $1 ORDER BY updated_at DESC',
      [userId],
    )
    return res.rows.map(toSummary)
  }

  async create(userId: string, name: string, database: Database): Promise<Design> {
    return this.tx(async (client) => {
      const res = await client.query<DesignRow>(
        'INSERT INTO designs (user_id, name) VALUES ($1, $2) RETURNING id, name, created_at, updated_at',
        [userId, name],
      )
      const row = res.rows[0]
      await this.writeStructure(client, row.id, database)
      return { ...toSummary(row), database }
    })
  }

  async update(
    userId: string,
    id: string,
    patch: { name?: string; database?: Database },
  ): Promise<Design | null> {
    return this.tx(async (client) => {
      const res = await client.query<DesignRow>(
        `UPDATE designs
         SET name = COALESCE($3, name), updated_at = now()
         WHERE id = $1 AND user_id = $2
         RETURNING id, name, created_at, updated_at`,
        [id, userId, patch.name ?? null],
      )
      const row = res.rows[0]
      if (!row) return null
      if (patch.database) {
        await client.query('DELETE FROM design_schemas WHERE design_id = $1', [id])
        await this.writeStructure(client, id, patch.database)
      }
      const database = patch.database ?? (await this.readStructure(client, id))
      return { ...toSummary(row), database }
    })
  }

  async get(userId: string, id: string): Promise<Design | null> {
    const res = await this.pool.query<DesignRow>(
      'SELECT id, name, created_at, updated_at FROM designs WHERE id = $1 AND user_id = $2',
      [id, userId],
    )
    const row = res.rows[0]
    if (!row) return null
    return { ...toSummary(row), database: await this.readStructure(this.pool, id) }
  }

  async remove(userId: string, id: string): Promise<boolean> {
    const res = await this.pool.query('DELETE FROM designs WHERE id = $1 AND user_id = $2', [
      id,
      userId,
    ])
    return (res.rowCount ?? 0) > 0
  }

  private async tx<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
    const client = await this.pool.connect()
    try {
      await client.query('BEGIN')
      const result = await fn(client)
      await client.query('COMMIT')
      return result
    } catch (err) {
      await client.query('ROLLBACK')
      throw err
    } finally {
      client.release()
    }
  }

  /** Insert a full normalized structure for a design (assumes none exists yet). */
  private async writeStructure(client: PoolClient, designId: string, db: Database): Promise<void> {
    for (const [si, schema] of db.schemas.entries()) {
      const schemaRes = await client.query<{ id: string }>(
        'INSERT INTO design_schemas (design_id, name, position) VALUES ($1, $2, $3) RETURNING id',
        [designId, schema.name, si],
      )
      const schemaId = schemaRes.rows[0].id

      for (const [ti, table] of schema.tables.entries()) {
        const tableRes = await client.query<{ id: string }>(
          'INSERT INTO design_tables (schema_id, name, position) VALUES ($1, $2, $3) RETURNING id',
          [schemaId, table.name, ti],
        )
        const tableId = tableRes.rows[0].id

        for (const [ci, col] of table.columns.entries()) {
          await client.query(
            `INSERT INTO design_columns (table_id, name, type, length, nullable, position)
             VALUES ($1, $2, $3, $4, $5, $6)`,
            [tableId, col.name, col.type, col.length ?? null, col.nullable, ci],
          )
        }
        for (const [ki, c] of table.constraints.entries()) {
          await client.query(
            'INSERT INTO design_constraints (table_id, name, type, columns, position) VALUES ($1, $2, $3, $4, $5)',
            [tableId, c.name, c.type, c.columns, ki],
          )
        }
        for (const [fi, fk] of table.foreignKeys.entries()) {
          await client.query(
            `INSERT INTO design_foreign_keys
               (table_id, name, target_table, source_columns, target_columns, position)
             VALUES ($1, $2, $3, $4, $5, $6)`,
            [tableId, fk.name, fk.targetTable, fk.sourceColumns, fk.targetColumns, fi],
          )
        }
      }
    }
  }

  /** Reconstruct the normalized structure back into a Database object. */
  private async readStructure(runner: Pool | PoolClient, designId: string): Promise<Database> {
    const schemas = await runner.query<{ id: string; name: string }>(
      'SELECT id, name FROM design_schemas WHERE design_id = $1 ORDER BY position',
      [designId],
    )
    const schemaIds = schemas.rows.map((s) => s.id)

    const tables = schemaIds.length
      ? await runner.query<{ id: string; schema_id: string; name: string }>(
          'SELECT id, schema_id, name FROM design_tables WHERE schema_id = ANY($1) ORDER BY position',
          [schemaIds],
        )
      : { rows: [] as Array<{ id: string; schema_id: string; name: string }> }
    const tableIds = tables.rows.map((t) => t.id)

    const empty = { rows: [] as never[] }
    const columns = tableIds.length
      ? await runner.query<{
          table_id: string
          name: string
          type: string
          length: number | null
          nullable: boolean
        }>(
          'SELECT table_id, name, type, length, nullable FROM design_columns WHERE table_id = ANY($1) ORDER BY position',
          [tableIds],
        )
      : empty
    const constraints = tableIds.length
      ? await runner.query<{ table_id: string; name: string; type: string; columns: string[] }>(
          'SELECT table_id, name, type, columns FROM design_constraints WHERE table_id = ANY($1) ORDER BY position',
          [tableIds],
        )
      : empty
    const fks = tableIds.length
      ? await runner.query<{
          table_id: string
          name: string
          target_table: string
          source_columns: string[]
          target_columns: string[]
        }>(
          `SELECT table_id, name, target_table, source_columns, target_columns
           FROM design_foreign_keys WHERE table_id = ANY($1) ORDER BY position`,
          [tableIds],
        )
      : empty

    const tableById = new Map<string, Table>()
    const tablesBySchema = new Map<string, Table[]>()
    for (const t of tables.rows) {
      const table: Table = { name: t.name, columns: [], constraints: [], foreignKeys: [] }
      tableById.set(t.id, table)
      const list = tablesBySchema.get(t.schema_id) ?? []
      list.push(table)
      tablesBySchema.set(t.schema_id, list)
    }
    for (const c of columns.rows) {
      tableById.get(c.table_id)?.columns.push({
        name: c.name,
        type: c.type,
        length: c.length ?? undefined,
        nullable: c.nullable,
      })
    }
    for (const k of constraints.rows) {
      tableById.get(k.table_id)?.constraints.push({
        name: k.name,
        type: k.type as ConstraintType,
        columns: k.columns,
      } as Constraint)
    }
    for (const f of fks.rows) {
      tableById.get(f.table_id)?.foreignKeys.push({
        name: f.name,
        targetTable: f.target_table,
        sourceColumns: f.source_columns,
        targetColumns: f.target_columns,
      } as ForeignKey)
    }

    const result: SchemaNs[] = schemas.rows.map((s) => ({
      name: s.name,
      tables: tablesBySchema.get(s.id) ?? [],
    }))
    return { schemas: result }
  }
}
