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
              target-columns: id
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
              target-columns: missing
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
})
