import { describe, expect, it } from 'vitest'
import { parse } from './parse'
import { SEED_YAML } from './seed'

describe('parse', () => {
  it('parses the seed schema without errors', () => {
    const { db, errors } = parse(SEED_YAML)
    expect(errors).toEqual([])
    expect(db.schemas).toHaveLength(1)
    const [schema] = db.schemas
    expect(schema.name).toBe('public')
    expect(schema.tables.map((t) => t.name)).toEqual(['user', 'address'])
  })

  it('preserves column order and parses type/length/nullable', () => {
    const { db } = parse(SEED_YAML)
    const user = db.schemas[0].tables[0]
    expect(user.columns.map((c) => c.name)).toEqual(['id', 'username', 'password'])
    const username = user.columns[1]
    expect(username).toMatchObject({ type: 'varchar', length: 25, nullable: false })
  })

  it('defaults nullable to true when omitted', () => {
    const { db } = parse(`database:
  schemas:
    s:
      tables:
        t:
          columns:
            a:
              type: integer
`)
    expect(db.schemas[0].tables[0].columns[0].nullable).toBe(true)
  })

  it('parses constraints with primary-key / unique / index types', () => {
    const { db } = parse(SEED_YAML)
    const user = db.schemas[0].tables[0]
    expect(user.constraints).toEqual([
      { name: 'pk_user__id', type: 'primary-key', columns: ['id'] },
      { name: 'idx_user__username', type: 'index', columns: ['username'] },
    ])
  })

  it('accepts "indices" as an alias for "constraints"', () => {
    const yaml = `database:
  schemas:
    s:
      tables:
        t:
          columns:
            id:
              type: integer
          indices:
            pk:
              type: primary-key
              columns:
                - id
`
    const { db, errors } = parse(yaml)
    expect(errors).toEqual([])
    expect(db.schemas[0].tables[0].constraints).toEqual([
      { name: 'pk', type: 'primary-key', columns: ['id'] },
    ])
  })

  it('normalizes scalar and list forms of foreign-key columns', () => {
    const { db } = parse(SEED_YAML)
    const address = db.schemas[0].tables[1]
    expect(address.foreignKeys).toEqual([
      {
        name: 'fk_address__user_id',
        sourceColumns: ['user_id'],
        targetTable: 'user',
        targetColumns: ['id'],
      },
    ])
  })

  it('reports a YAML syntax error', () => {
    const { errors } = parse('database: : :\n  bad')
    expect(errors).toHaveLength(1)
    expect(errors[0].message).toMatch(/YAML syntax error/)
  })

  it('reports a missing column type', () => {
    const { errors } = parse(`database:
  schemas:
    s:
      tables:
        t:
          columns:
            a:
              length: 10
`)
    expect(errors.some((e) => e.message.includes('missing a string "type"'))).toBe(true)
  })

  it('reports an unknown constraint type', () => {
    const { errors } = parse(`database:
  schemas:
    s:
      tables:
        t:
          columns:
            id:
              type: integer
          constraints:
            c:
              type: bogus
              columns:
                - id
`)
    expect(errors.some((e) => e.path.endsWith('constraints.c.type'))).toBe(true)
  })

  it('reports a constraint referencing an unknown column', () => {
    const { errors } = parse(`database:
  schemas:
    s:
      tables:
        t:
          columns:
            id:
              type: integer
          constraints:
            c:
              type: index
              columns:
                - missing
`)
    expect(errors.some((e) => e.message.includes('unknown column "missing"'))).toBe(true)
  })

  it('reports a foreign key to an unknown target table', () => {
    const { errors } = parse(`database:
  schemas:
    s:
      tables:
        t:
          columns:
            ref_id:
              type: integer
          foreign-keys:
            fk:
              source-column: ref_id
              table: nope
              target-column: id
`)
    expect(errors.some((e) => e.message.includes('unknown target table "nope"'))).toBe(true)
  })

  it('reports a foreign key to an unknown target column', () => {
    const { errors } = parse(`database:
  schemas:
    s:
      tables:
        a:
          columns:
            id:
              type: integer
        b:
          columns:
            a_id:
              type: integer
          foreign-keys:
            fk:
              source-column: a_id
              table: a
              target-column: missing
`)
    expect(errors.some((e) => e.message.includes('unknown target column "a.missing"'))).toBe(true)
  })

  it('errors when the top-level "database" mapping is absent', () => {
    const { errors } = parse('foo: bar')
    expect(errors).toHaveLength(1)
    expect(errors[0].message).toMatch(/top-level "database"/)
  })

  it('returns an empty database for empty input without errors', () => {
    const { db, errors } = parse('')
    expect(db.schemas).toEqual([])
    expect(errors).toEqual([])
  })

  it('errors when "schemas" is not a mapping', () => {
    const { errors } = parse('database:\n  schemas: nope\n')
    expect(errors.some((e) => e.path === 'database.schemas')).toBe(true)
  })

  it('errors on non-mapping schema, tables, columns and column nodes', () => {
    const schema = parse('database:\n  schemas:\n    s: nope\n')
    expect(schema.errors.some((e) => e.message === 'expected a schema mapping')).toBe(true)

    const tables = parse('database:\n  schemas:\n    s:\n      tables: nope\n')
    expect(tables.errors.some((e) => e.message === 'expected a "tables" mapping')).toBe(true)

    const cols = parse(`database:
  schemas:
    s:
      tables:
        t:
          columns: nope
`)
    expect(cols.errors.some((e) => e.message === 'expected a "columns" mapping')).toBe(true)

    const col = parse(`database:
  schemas:
    s:
      tables:
        t:
          columns:
            a: nope
`)
    expect(col.errors.some((e) => e.message === 'expected a column mapping')).toBe(true)
  })

  it('errors when length or nullable have the wrong type', () => {
    const { errors } = parse(`database:
  schemas:
    s:
      tables:
        t:
          columns:
            a:
              type: varchar
              length: long
              nullable: maybe
`)
    expect(errors.some((e) => e.path.endsWith('.length'))).toBe(true)
    expect(errors.some((e) => e.path.endsWith('.nullable'))).toBe(true)
  })

  it('errors on non-mapping constraints and constraint nodes', () => {
    const block = parse(`database:
  schemas:
    s:
      tables:
        t:
          columns:
            id:
              type: integer
          constraints: nope
`)
    expect(block.errors.some((e) => e.message === 'expected a "constraints" mapping')).toBe(true)

    const entry = parse(`database:
  schemas:
    s:
      tables:
        t:
          columns:
            id:
              type: integer
          constraints:
            c: nope
`)
    expect(entry.errors.some((e) => e.message === 'expected a constraint mapping')).toBe(true)
  })

  it('errors on non-mapping foreign-keys, fk node, and missing target table', () => {
    const block = parse(`database:
  schemas:
    s:
      tables:
        t:
          columns:
            id:
              type: integer
          foreign-keys: nope
`)
    expect(block.errors.some((e) => e.message === 'expected a "foreign-keys" mapping')).toBe(true)

    const entry = parse(`database:
  schemas:
    s:
      tables:
        t:
          columns:
            id:
              type: integer
          foreign-keys:
            fk: nope
`)
    expect(entry.errors.some((e) => e.message === 'expected a foreign-key mapping')).toBe(true)

    const noTable = parse(`database:
  schemas:
    s:
      tables:
        t:
          columns:
            id:
              type: integer
          foreign-keys:
            fk:
              source-column: id
              target-columns: id
`)
    expect(noTable.errors.some((e) => e.message.includes('missing a target "table"'))).toBe(true)
  })

  it('accepts source-columns (list) and target-column (scalar)', () => {
    const { db, errors } = parse(`database:
  schemas:
    s:
      tables:
        a:
          columns:
            id:
              type: integer
        b:
          columns:
            a_id:
              type: integer
          foreign-keys:
            fk:
              source-columns:
                - a_id
              table: a
              target-column: id
`)
    expect(errors).toEqual([])
    expect(db.schemas[0].tables[1].foreignKeys[0]).toMatchObject({
      sourceColumns: ['a_id'],
      targetColumns: ['id'],
    })
  })

  it('enforces singular FK keys as scalars and plural as lists', () => {
    const base = (fk: string) => `database:
  schemas:
    s:
      tables:
        a:
          columns:
            id:
              type: integer
        b:
          columns:
            a_id:
              type: integer
          foreign-keys:
            fk:
${fk}
`
    // singular key given a list -> error
    const singularList = parse(
      base(
        '              source-column:\n                - a_id\n              table: a\n              target-column: id',
      ),
    )
    expect(
      singularList.errors.some((e) =>
        e.message.includes('"source-column" must be a single column'),
      ),
    ).toBe(true)

    // plural key given a scalar -> error
    const pluralScalar = parse(
      base(
        '              source-columns: a_id\n              table: a\n              target-column: id',
      ),
    )
    expect(
      pluralScalar.errors.some((e) => e.message.includes('"source-columns" must be a list')),
    ).toBe(true)

    // both keys of a pair -> error
    const both = parse(
      base(
        '              source-column: a_id\n              source-columns:\n                - a_id\n              table: a\n              target-column: id',
      ),
    )
    expect(both.errors.some((e) => e.message.includes('not both'))).toBe(true)

    // neither key -> error
    const neither = parse(base('              table: a\n              target-column: id'))
    expect(
      neither.errors.some((e) => e.message.includes('missing "source-column" or "source-columns"')),
    ).toBe(true)
  })

  it('reports a foreign key with an unknown source column', () => {
    const { errors } = parse(`database:
  schemas:
    s:
      tables:
        a:
          columns:
            id:
              type: integer
        b:
          columns:
            real:
              type: integer
          foreign-keys:
            fk:
              source-column: ghost
              table: a
              target-column: id
`)
    expect(errors.some((e) => e.message === 'unknown source column "ghost"')).toBe(true)
  })
})
