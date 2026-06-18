import type { Edge, Node } from '@xyflow/react'
import { MarkerType } from '@xyflow/react'
import type { Column, Database, Table } from '../schema/types'
import { NODE_WIDTH, tableHeight } from './dimensions'

export interface ColumnBadges {
  pk: boolean
  uq: boolean
  ix: boolean
  fk: boolean
}

export interface TableNodeData extends Record<string, unknown> {
  table: Table
  badges: Record<string, ColumnBadges>
}

export type TableFlowNode = Node<TableNodeData, 'table'>

export function nodeId(schema: string, table: string): string {
  return `${schema}.${table}`
}

export const sourceHandleId = (col: string) => `${col}__source`
export const targetHandleId = (col: string) => `${col}__target`

function computeBadges(table: Table): Record<string, ColumnBadges> {
  const badges: Record<string, ColumnBadges> = {}
  for (const c of table.columns) {
    badges[c.name] = { pk: false, uq: false, ix: false, fk: false }
  }
  const mark = (col: string, key: keyof ColumnBadges) => {
    if (badges[col]) badges[col][key] = true
  }

  for (const c of table.constraints) {
    const key = c.type === 'primary-key' ? 'pk' : c.type === 'unique' ? 'uq' : 'ix'
    for (const col of c.columns) mark(col, key)
  }
  for (const fk of table.foreignKeys) {
    for (const col of fk.sourceColumns) mark(col, 'fk')
  }
  return badges
}

/**
 * Convert a parsed {@link Database} into React Flow nodes and edges. Node sizes
 * are estimated from column counts so the layout engine can position them; the
 * actual x/y are filled in later by {@link ../layout/elkLayout.layoutGraph}.
 */
export function toReactFlow(db: Database): { nodes: TableFlowNode[]; edges: Edge[] } {
  const nodes: TableFlowNode[] = []
  const edges: Edge[] = []

  // Index tables so foreign keys can resolve their target schema.
  const byName = new Map<string, Table>()
  for (const schema of db.schemas) {
    for (const table of schema.tables) {
      byName.set(`${schema.name}.${table.name}`, table)
      byName.set(table.name, table)
    }
  }

  for (const schema of db.schemas) {
    for (const table of schema.tables) {
      nodes.push({
        id: nodeId(schema.name, table.name),
        type: 'table',
        position: { x: 0, y: 0 },
        data: { table, badges: computeBadges(table) },
        width: NODE_WIDTH,
        height: tableHeight(table.columns.length),
      })

      for (const fk of table.foreignKeys) {
        const target = byName.get(`${schema.name}.${fk.targetTable}`) ?? byName.get(fk.targetTable)
        if (!target) continue

        const sourceCol = fk.sourceColumns[0]
        const targetCol = fk.targetColumns[0]
        edges.push({
          id: `${schema.name}.${table.name}:${fk.name}`,
          source: nodeId(schema.name, table.name),
          target: nodeId(target.schema, target.name),
          sourceHandle: sourceCol ? sourceHandleId(sourceCol) : undefined,
          targetHandle: targetCol ? targetHandleId(targetCol) : undefined,
          type: 'smoothstep',
          label: fk.name,
          markerEnd: { type: MarkerType.ArrowClosed, width: 18, height: 18 },
          style: { stroke: '#7c93b3', strokeWidth: 1.5 },
          labelStyle: { fontSize: 10, fill: '#9aa7b8' },
          labelBgStyle: { fill: '#11161d', fillOpacity: 0.85 },
        })
      }
    }
  }

  return { nodes, edges }
}

export type { Column }
