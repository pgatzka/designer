import { describe, expect, it } from 'vitest'
import { assembleDatabase, normalizeColumnType } from '../src/designs/introspect'
import type { RawColumn, RawSchema } from '../src/designs/types'

const col = (over: Partial<RawColumn>): RawColumn => ({
  schema: 'public',
  table: 't',
  name: 'c',
  dataType: 'integer',
  nullable: true,
  position: 1,
  ...over,
})

describe('normalizeColumnType', () => {
  it('maps Postgres native types to catalog names', () => {
    expect(normalizeColumnType('postgres', col({ dataType: 'integer' }))).toEqual({
      type: 'integer',
    })
    expect(
      normalizeColumnType('postgres', col({ dataType: 'timestamp without time zone' })),
    ).toEqual({ type: 'timestamp' })
    expect(normalizeColumnType('postgres', col({ dataType: 'timestamp with time zone' }))).toEqual({
      type: 'timestamptz',
    })
  })

  it('applies length only to length-bearing types', () => {
    expect(
      normalizeColumnType('postgres', col({ dataType: 'character varying', charMaxLength: 25 })),
    ).toEqual({ type: 'varchar', length: 25 })
    // a length on a non-length type is dropped
    expect(
      normalizeColumnType('postgres', col({ dataType: 'integer', charMaxLength: 32 })),
    ).toEqual({ type: 'integer' })
  })

  it('degrades varchar(max) (length -1) to text', () => {
    expect(
      normalizeColumnType('sqlserver', col({ dataType: 'nvarchar', charMaxLength: -1 })),
    ).toEqual({ type: 'text' })
    expect(
      normalizeColumnType('sqlserver', col({ dataType: 'nvarchar', charMaxLength: 200 })),
    ).toEqual({ type: 'nvarchar', length: 200 })
  })

  it('maps MySQL and SQL Server integer aliases', () => {
    expect(normalizeColumnType('mysql', col({ dataType: 'INT' }))).toEqual({ type: 'int' })
    expect(normalizeColumnType('mysql', col({ dataType: 'mediumint' }))).toEqual({ type: 'int' })
    expect(normalizeColumnType('sqlserver', col({ dataType: 'bit' }))).toEqual({ type: 'bit' })
  })

  it('falls back to the lowercased native type when unmapped', () => {
    expect(normalizeColumnType('postgres', col({ dataType: 'GEOMETRY' }))).toEqual({
      type: 'geometry',
    })
  })
})

describe('assembleDatabase', () => {
  const raw: RawSchema = {
    columns: [
      col({ schema: 'public', table: 'user', name: 'id', dataType: 'integer', position: 1 }),
      col({
        schema: 'public',
        table: 'user',
        name: 'email',
        dataType: 'character varying',
        charMaxLength: 255,
        nullable: false,
        position: 2,
      }),
      col({ schema: 'audit', table: 'log', name: 'user_id', dataType: 'integer', position: 1 }),
    ],
    constraints: [
      { schema: 'public', table: 'user', name: 'pk_user', type: 'primary-key', columns: ['id'] },
      { schema: 'public', table: 'user', name: 'uq_email', type: 'unique', columns: ['email'] },
    ],
    foreignKeys: [
      {
        schema: 'audit',
        table: 'log',
        name: 'fk_log_user',
        columns: ['user_id'],
        targetSchema: 'public',
        targetTable: 'user',
        targetColumns: ['id'],
      },
    ],
  }

  it('groups columns into schemas/tables, ordered by position, with normalized types', () => {
    const db = assembleDatabase('postgres', raw)
    expect(db.schemas.map((s) => s.name)).toEqual(['public', 'audit'])
    const user = db.schemas[0].tables[0]
    expect(user.name).toBe('user')
    expect(user.columns).toEqual([
      { name: 'id', type: 'integer', nullable: true },
      { name: 'email', type: 'varchar', length: 255, nullable: false },
    ])
    expect(user.constraints.map((c) => c.name)).toEqual(['pk_user', 'uq_email'])
  })

  it('qualifies cross-schema FK targets and leaves same-schema targets bare', () => {
    const db = assembleDatabase('postgres', raw)
    const log = db.schemas[1].tables[0]
    expect(log.foreignKeys[0]).toEqual({
      name: 'fk_log_user',
      sourceColumns: ['user_id'],
      targetTable: 'public.user', // audit.log -> public.user (cross-schema)
      targetColumns: ['id'],
    })

    const sameSchema = assembleDatabase('postgres', {
      columns: [col({ schema: 's', table: 'a', name: 'b_id', position: 1 })],
      constraints: [],
      foreignKeys: [
        {
          schema: 's',
          table: 'a',
          name: 'fk',
          columns: ['b_id'],
          targetSchema: 's',
          targetTable: 'b',
          targetColumns: ['id'],
        },
      ],
    })
    expect(sameSchema.schemas[0].tables[0].foreignKeys[0].targetTable).toBe('b')
  })

  it('returns an empty database for empty input', () => {
    expect(assembleDatabase('mysql', { columns: [], constraints: [], foreignKeys: [] })).toEqual({
      schemas: [],
    })
  })
})
