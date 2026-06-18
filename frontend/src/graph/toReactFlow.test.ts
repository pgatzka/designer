import { describe, expect, it } from 'vitest'
import { parse } from '../schema/parse'
import { SEED_YAML } from '../schema/seed'
import type { Database, Table } from '../schema/types'
import { nodeId, sourceHandleId, targetHandleId, toReactFlow } from './toReactFlow'

function findNode(nodes: ReturnType<typeof toReactFlow>['nodes'], id: string) {
  const n = nodes.find((node) => node.id === id)
  if (!n) throw new Error(`node ${id} not found`)
  return n
}

describe('toReactFlow', () => {
  it('returns empty graph for an empty database', () => {
    const { nodes, edges } = toReactFlow({ schemas: [] })
    expect(nodes).toEqual([])
    expect(edges).toEqual([])
  })

  it('builds one node per table with estimated sizes', () => {
    const { db } = parse(SEED_YAML)
    const { nodes } = toReactFlow(db)
    expect(nodes.map((n) => n.id)).toEqual(['public.user', 'public.address'])
    const user = findNode(nodes, 'public.user')
    expect(user.type).toBe('table')
    expect(user.width).toBeGreaterThan(0)
    expect(user.height).toBeGreaterThan(0)
  })

  it('derives PK / FK / UQ / IX badges per column', () => {
    const { db } = parse(SEED_YAML)
    const { nodes } = toReactFlow(db)
    const user = findNode(nodes, 'public.user').data.badges
    expect(user.id).toMatchObject({ pk: true })
    expect(user.username).toMatchObject({ ix: true })

    const address = findNode(nodes, 'public.address').data.badges
    expect(address.id.pk).toBe(true)
    expect(address.street.uq).toBe(true)
    expect(address.zip.uq).toBe(true)
    expect(address.user_id.fk).toBe(true)
  })

  it('creates an FK edge anchored at the source/target column handles', () => {
    const { db } = parse(SEED_YAML)
    const { edges } = toReactFlow(db)
    expect(edges).toHaveLength(1)
    expect(edges[0]).toMatchObject({
      source: nodeId('public', 'address'),
      target: nodeId('public', 'user'),
      sourceHandle: sourceHandleId('user_id'),
      targetHandle: targetHandleId('id'),
      type: 'smoothstep',
    })
  })

  it('skips edges whose target table cannot be resolved', () => {
    const db: Database = {
      schemas: [
        {
          name: 'public',
          tables: [
            {
              schema: 'public',
              name: 'a',
              columns: [{ name: 'b_id', type: 'integer', nullable: false }],
              constraints: [],
              foreignKeys: [
                {
                  name: 'fk_missing',
                  sourceColumns: ['b_id'],
                  targetTable: 'ghost',
                  targetColumns: ['id'],
                },
              ],
            },
          ],
        },
      ],
    }
    expect(toReactFlow(db).edges).toEqual([])
  })

  it('resolves schema-qualified targets and tolerates missing handle columns', () => {
    const target: Table = {
      schema: 'public',
      name: 'b',
      columns: [{ name: 'id', type: 'integer', nullable: false }],
      constraints: [],
      foreignKeys: [],
    }
    const source: Table = {
      schema: 'public',
      name: 'a',
      columns: [{ name: 'b_id', type: 'integer', nullable: false }],
      constraints: [
        // References a column that does not exist -> mark() guard branch.
        { name: 'bad', type: 'index', columns: ['nope'] },
      ],
      foreignKeys: [
        {
          name: 'fk_ab',
          sourceColumns: [], // no source/target columns -> handles undefined
          targetTable: 'public.b',
          targetColumns: [],
        },
      ],
    }
    const db: Database = { schemas: [{ name: 'public', tables: [source, target] }] }
    const { edges } = toReactFlow(db)
    expect(edges).toHaveLength(1)
    expect(edges[0].sourceHandle).toBeUndefined()
    expect(edges[0].targetHandle).toBeUndefined()
    expect(edges[0].target).toBe('public.b')
  })
})
