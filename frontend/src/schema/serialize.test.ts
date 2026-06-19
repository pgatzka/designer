import { describe, expect, it } from 'vitest'
import { parse } from './parse'
import { serialize } from './serialize'
import { SEED_YAML } from './seed'

describe('serialize', () => {
  it('round-trips the seed schema through parse', () => {
    const { db, errors } = parse(SEED_YAML)
    expect(errors).toEqual([])
    const reparsed = parse(serialize(db))
    expect(reparsed.errors).toEqual([])
    expect(reparsed.db).toEqual(db)
  })

  it('produces block-style YAML (no flow braces/brackets)', () => {
    const { db } = parse(SEED_YAML)
    const out = serialize(db)
    expect(out).not.toMatch(/[{}[\]]/)
    expect(out.startsWith('database:')).toBe(true)
  })

  it('emits scalar source-column/target-column for single-column FKs', () => {
    const { db } = parse(SEED_YAML)
    const out = serialize(db)
    expect(out).toMatch(/source-column: user_id/)
    expect(out).toMatch(/target-column: id/)
    expect(out).not.toContain('source-columns')
    expect(out).not.toContain('target-columns')
  })

  it('emits plural list keys for composite FKs', () => {
    const { db } = parse(`database:
  schemas:
    s:
      tables:
        a:
          columns:
            x:
              type: integer
            y:
              type: integer
        b:
          columns:
            ax:
              type: integer
            ay:
              type: integer
          foreign-keys:
            fk:
              source-columns:
                - ax
                - ay
              table: a
              target-columns:
                - x
                - y
`)
    const out = serialize(db)
    expect(out).toContain('source-columns:')
    expect(out).toContain('target-columns:')
    expect(out).not.toMatch(/source-column:/)
    expect(parse(out).db).toEqual(db)
  })

  it('omits nullable when true and emits it when false', () => {
    const { db } = parse(`database:
  schemas:
    public:
      tables:
        t:
          columns:
            a:
              type: integer
            b:
              type: varchar
              length: 10
              nullable: false
`)
    const out = serialize(db)
    expect(out).toContain('length: 10')
    expect(out).toMatch(/nullable: false/)
    // The nullable:true column must not emit a nullable line.
    expect(out.match(/nullable:/g)).toHaveLength(1)
    expect(parse(out).db).toEqual(db)
  })

  it('round-trips constraints and foreign keys', () => {
    const { db } = parse(`database:
  schemas:
    public:
      tables:
        a:
          columns:
            id:
              type: integer
              nullable: false
          constraints:
            pk_a:
              type: primary-key
              columns:
                - id
        b:
          columns:
            a_id:
              type: integer
              nullable: false
          foreign-keys:
            fk_b_a:
              source-columns:
                - a_id
              table: a
              target-columns:
                - id
`)
    expect(parse(serialize(db)).db).toEqual(db)
  })
})
