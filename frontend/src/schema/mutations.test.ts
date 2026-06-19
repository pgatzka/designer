import { describe, expect, it } from 'vitest'
import { parse } from './parse'
import { SEED_YAML } from './seed'
import type { Database, Table } from './types'
import {
  addColumn,
  addConstraint,
  addForeignKey,
  addSchema,
  addTable,
  findTable,
  moveColumn,
  removeColumn,
  removeConstraint,
  removeForeignKey,
  removeSchema,
  removeTable,
  renameSchema,
  renameTable,
  schemaNames,
  tableOptions,
  updateColumn,
  updateForeignKey,
} from './mutations'

const base = (): Database => parse(SEED_YAML).db
const table = (db: Database, s: string, t: string): Table => {
  const found = findTable(db, s, t)
  if (!found) throw new Error(`missing ${s}.${t}`)
  return found
}

// public.user (id, username, password) + public.address (id, street, zip, user_id)
// with FK fk_address__user_id: user_id -> user.id

describe('lookup helpers', () => {
  it('findTable / schemaNames / tableOptions', () => {
    const db = base()
    expect(findTable(db, 'public', 'user')?.name).toBe('user')
    expect(findTable(db, 'public', 'nope')).toBeUndefined()
    expect(schemaNames(db)).toEqual(['public'])
    expect(tableOptions(db)).toEqual([
      { schema: 'public', table: 'user' },
      { schema: 'public', table: 'address' },
    ])
  })
})

describe('column mutations', () => {
  it('addColumn appends to the table', () => {
    const db = addColumn(base(), 'public', 'user', {
      name: 'email',
      type: 'varchar',
      nullable: true,
    })
    expect(table(db, 'public', 'user').columns.map((c) => c.name)).toEqual([
      'id',
      'username',
      'password',
      'email',
    ])
  })

  it('updateColumn changes props without touching references when not renamed', () => {
    const db = updateColumn(base(), 'public', 'user', 'password', {
      name: 'password',
      type: 'text',
      nullable: false,
    })
    const user = table(db, 'public', 'user')
    expect(user.columns.find((c) => c.name === 'password')?.type).toBe('text')
    expect(user.constraints.find((c) => c.name === 'pk_user__id')?.columns).toEqual(['id'])
  })

  it('updateColumn rename cascades to constraints and referencing FKs', () => {
    const db = updateColumn(base(), 'public', 'user', 'id', {
      name: 'uid',
      type: 'integer',
      nullable: false,
    })
    const user = table(db, 'public', 'user')
    expect(user.columns.map((c) => c.name)).toContain('uid')
    expect(user.constraints.find((c) => c.name === 'pk_user__id')?.columns).toEqual(['uid'])
    // address FK targeted user.id -> now user.uid
    expect(table(db, 'public', 'address').foreignKeys[0].targetColumns).toEqual(['uid'])
  })

  it('removeColumn drops it from constraints (emptied dropped) and FKs', () => {
    let db = removeColumn(base(), 'public', 'user', 'id')
    const user = table(db, 'public', 'user')
    expect(user.columns.map((c) => c.name)).not.toContain('id')
    expect(user.constraints.find((c) => c.name === 'pk_user__id')).toBeUndefined() // emptied -> removed
    // address FK target column 'id' removed -> FK emptied -> dropped
    expect(table(db, 'public', 'address').foreignKeys).toHaveLength(0)

    // partial constraint shrink + FK source removal
    db = removeColumn(base(), 'public', 'address', 'street')
    const address = table(db, 'public', 'address')
    expect(address.constraints.find((c) => c.name === 'uk_address__street__zip')?.columns).toEqual([
      'zip',
    ])
    const db2 = removeColumn(base(), 'public', 'address', 'user_id')
    expect(table(db2, 'public', 'address').foreignKeys).toHaveLength(0)
  })

  it('moveColumn reorders and no-ops at the edges / unknown column', () => {
    const up = moveColumn(base(), 'public', 'user', 'username', 'up')
    expect(table(up, 'public', 'user').columns.map((c) => c.name)).toEqual([
      'username',
      'id',
      'password',
    ])
    const down = moveColumn(base(), 'public', 'user', 'password', 'down') // last -> no-op
    expect(table(down, 'public', 'user').columns.map((c) => c.name)).toEqual([
      'id',
      'username',
      'password',
    ])
    const top = moveColumn(base(), 'public', 'user', 'id', 'up') // first -> no-op
    expect(table(top, 'public', 'user').columns[0].name).toBe('id')
    const missing = moveColumn(base(), 'public', 'user', 'ghost', 'down') // unknown -> no-op
    expect(table(missing, 'public', 'user').columns).toHaveLength(3)
  })
})

describe('constraint & foreign-key mutations', () => {
  it('add/remove constraint', () => {
    const added = addConstraint(base(), 'public', 'user', {
      name: 'uk_user__email',
      type: 'unique',
      columns: ['username'],
    })
    expect(table(added, 'public', 'user').constraints.map((c) => c.name)).toContain(
      'uk_user__email',
    )
    const removed = removeConstraint(added, 'public', 'user', 'idx_user__username')
    expect(table(removed, 'public', 'user').constraints.map((c) => c.name)).not.toContain(
      'idx_user__username',
    )
  })

  it('add/update/remove foreign key', () => {
    const fk = {
      name: 'fk_user__x',
      sourceColumns: ['id'],
      targetTable: 'address',
      targetColumns: ['id'],
    }
    const added = addForeignKey(base(), 'public', 'user', fk)
    expect(table(added, 'public', 'user').foreignKeys).toHaveLength(1)
    const updated = updateForeignKey(added, 'public', 'user', 'fk_user__x', {
      ...fk,
      targetColumns: ['zip'],
    })
    expect(table(updated, 'public', 'user').foreignKeys[0].targetColumns).toEqual(['zip'])
    const removed = removeForeignKey(updated, 'public', 'user', 'fk_user__x')
    expect(table(removed, 'public', 'user').foreignKeys).toHaveLength(0)
  })
})

// db with a second schema referencing public.user by bare and qualified name
function crossDb(): Database {
  let db = base()
  db = addSchema(db, 'audit')
  db = addTable(db, 'audit', {
    name: 'log',
    columns: [{ name: 'user_id', type: 'integer', nullable: false }],
    constraints: [],
    foreignKeys: [],
  })
  db = addForeignKey(db, 'audit', 'log', {
    name: 'fk_bare',
    sourceColumns: ['user_id'],
    targetTable: 'user',
    targetColumns: ['id'],
  })
  db = addForeignKey(db, 'audit', 'log', {
    name: 'fk_qual',
    sourceColumns: ['user_id'],
    targetTable: 'public.user',
    targetColumns: ['id'],
  })
  return db
}

describe('table & schema mutations', () => {
  it('addTable adds with schema set; no-op for unknown schema', () => {
    const added = addTable(base(), 'public', {
      name: 'tag',
      columns: [{ name: 'id', type: 'integer', nullable: false }],
      constraints: [],
      foreignKeys: [],
    })
    expect(table(added, 'public', 'tag').schema).toBe('public')
    const noop = addTable(base(), 'ghost', {
      name: 'x',
      columns: [],
      constraints: [],
      foreignKeys: [],
    })
    expect(noop).toEqual(base())
  })

  it('renameTable retargets bare and schema-qualified FKs', () => {
    const db = renameTable(crossDb(), 'public', 'user', 'account')
    expect(findTable(db, 'public', 'account')).toBeDefined()
    const fks = table(db, 'audit', 'log').foreignKeys
    expect(fks.find((f) => f.name === 'fk_bare')?.targetTable).toBe('account')
    expect(fks.find((f) => f.name === 'fk_qual')?.targetTable).toBe('public.account')
  })

  it('removeTable drops the table and FKs pointing at it', () => {
    const db = removeTable(crossDb(), 'public', 'user')
    expect(findTable(db, 'public', 'user')).toBeUndefined()
    expect(table(db, 'audit', 'log').foreignKeys).toHaveLength(0)
    // address FK to user also gone
    expect(table(db, 'public', 'address').foreignKeys).toHaveLength(0)
  })

  it('addSchema adds once; renameSchema updates tables and qualified FKs', () => {
    const added = addSchema(base(), 'audit')
    expect(schemaNames(added)).toEqual(['public', 'audit'])
    expect(addSchema(added, 'audit')).toEqual(added) // duplicate -> no-op

    const renamed = renameSchema(crossDb(), 'public', 'app')
    expect(schemaNames(renamed)).toContain('app')
    expect(table(renamed, 'app', 'user').schema).toBe('app')
    const fks = table(renamed, 'audit', 'log').foreignKeys
    expect(fks.find((f) => f.name === 'fk_qual')?.targetTable).toBe('app.user')
    expect(fks.find((f) => f.name === 'fk_bare')?.targetTable).toBe('user') // bare unaffected
  })

  it('removeSchema drops the schema and FKs into it (bare or qualified)', () => {
    const db = removeSchema(crossDb(), 'public')
    expect(schemaNames(db)).toEqual(['audit'])
    expect(table(db, 'audit', 'log').foreignKeys).toHaveLength(0)
  })
})
