import { describe, expect, it } from 'vitest'
import { FLAVORS, getFlavor, isFlavorId, typeNames, validateColumnType } from './flavors'

describe('flavor catalog', () => {
  it('isFlavorId recognizes known ids only', () => {
    expect(isFlavorId('postgres')).toBe(true)
    expect(isFlavorId('mysql')).toBe(true)
    expect(isFlavorId('sqlserver')).toBe(true)
    expect(isFlavorId('sqlite')).toBe(false)
    expect(isFlavorId(undefined)).toBe(false)
    expect(isFlavorId(42)).toBe(false)
  })

  it('getFlavor resolves ids and returns undefined otherwise', () => {
    expect(getFlavor('mysql')).toBe(FLAVORS.mysql)
    expect(getFlavor(undefined)).toBeUndefined()
    expect(getFlavor('nope')).toBeUndefined()
  })

  it('typeNames lists the catalog type names', () => {
    expect(typeNames(FLAVORS.postgres)).toContain('integer')
    expect(typeNames(FLAVORS.mysql)).toContain('varchar')
  })
})

describe('validateColumnType', () => {
  it('rejects an unknown type for the flavor', () => {
    expect(validateColumnType(FLAVORS.postgres, 'jsonb', undefined)).toBeNull()
    expect(validateColumnType(FLAVORS.mysql, 'jsonb', undefined)).toMatch(/unknown MySQL type/)
  })

  it('matches type names case-insensitively', () => {
    expect(validateColumnType(FLAVORS.postgres, 'INTEGER', undefined)).toBeNull()
    expect(validateColumnType(FLAVORS.postgres, 'VarChar', 25)).toBeNull()
  })

  it('enforces required length (MySQL varchar)', () => {
    expect(validateColumnType(FLAVORS.mysql, 'varchar', undefined)).toMatch(/requires a length/)
    expect(validateColumnType(FLAVORS.mysql, 'varchar', 25)).toBeNull()
  })

  it('enforces forbidden length (Postgres integer)', () => {
    expect(validateColumnType(FLAVORS.postgres, 'integer', 11)).toMatch(/does not take a length/)
    expect(validateColumnType(FLAVORS.postgres, 'integer', undefined)).toBeNull()
  })

  it('allows optional length either way (Postgres varchar)', () => {
    expect(validateColumnType(FLAVORS.postgres, 'varchar', undefined)).toBeNull()
    expect(validateColumnType(FLAVORS.postgres, 'varchar', 25)).toBeNull()
  })
})
