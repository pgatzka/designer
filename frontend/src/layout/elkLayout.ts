import ELK, { type ElkNode } from 'elkjs/lib/elk.bundled.js'
import type { Edge } from '@xyflow/react'
import type { TableFlowNode } from '../graph/toReactFlow'
import { NODE_WIDTH, tableHeight } from '../graph/dimensions'

const elk = new ELK()

const LAYOUT_OPTIONS: Record<string, string> = {
  'elk.algorithm': 'layered',
  'elk.direction': 'RIGHT',
  'elk.layered.spacing.nodeNodeBetweenLayers': '90',
  'elk.spacing.nodeNode': '60',
  'elk.layered.spacing.edgeNodeBetweenLayers': '40',
  'elk.layered.nodePlacement.strategy': 'BRANDES_KOEPF',
  'elk.edgeRouting': 'ORTHOGONAL',
}

/**
 * Run ELK's layered layout over the given nodes/edges and return new nodes with
 * computed `position`. Pure with respect to React Flow state — callers replace
 * their node array with the result.
 */
export async function layoutGraph(nodes: TableFlowNode[], edges: Edge[]): Promise<TableFlowNode[]> {
  if (nodes.length === 0) return nodes

  const graph: ElkNode = {
    id: 'root',
    layoutOptions: LAYOUT_OPTIONS,
    children: nodes.map((n) => ({
      id: n.id,
      width: n.width ?? NODE_WIDTH,
      height: n.height ?? tableHeight(n.data.table.columns.length),
    })),
    edges: edges.map((e) => ({
      id: e.id,
      sources: [e.source],
      targets: [e.target],
    })),
  }

  const result = await elk.layout(graph)
  const positions = new Map<string, { x: number; y: number }>()
  for (const child of result.children ?? []) {
    positions.set(child.id, { x: child.x ?? 0, y: child.y ?? 0 })
  }

  return nodes.map((n) => {
    const pos = positions.get(n.id)
    return pos ? { ...n, position: pos } : n
  })
}
