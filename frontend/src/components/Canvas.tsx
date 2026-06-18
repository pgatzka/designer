import { useCallback, useEffect, useRef } from 'react'
import {
  Background,
  Controls,
  type Edge,
  MiniMap,
  Panel,
  ReactFlow,
  ReactFlowProvider,
  useEdgesState,
  useNodesState,
  useReactFlow,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import type { Database } from '../schema/types'
import { toReactFlow, type TableFlowNode } from '../graph/toReactFlow'
import { layoutGraph } from '../layout/elkLayout'
import { TableNode } from './TableNode'

const nodeTypes = { table: TableNode }

interface CanvasProps {
  db: Database
}

function Flow({ db }: CanvasProps) {
  const [nodes, setNodes, onNodesChange] = useNodesState<TableFlowNode>([])
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([])
  const { fitView } = useReactFlow()
  const runId = useRef(0)

  const arrange = useCallback(
    async (fit: boolean) => {
      const id = ++runId.current
      const { nodes: rawNodes, edges: rawEdges } = toReactFlow(db)
      const laidOut = await layoutGraph(rawNodes, rawEdges)
      if (id !== runId.current) return // a newer run superseded this one
      setNodes(laidOut)
      setEdges(rawEdges)
      if (fit) {
        requestAnimationFrame(() => fitView({ padding: 0.2, duration: 300 }))
      }
    },
    [db, fitView, setNodes, setEdges],
  )

  // Re-layout whenever the schema changes.
  useEffect(() => {
    void arrange(true)
  }, [arrange])

  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      onNodesChange={onNodesChange}
      onEdgesChange={onEdgesChange}
      nodeTypes={nodeTypes}
      nodesDraggable={false}
      nodesConnectable={false}
      elementsSelectable
      proOptions={{ hideAttribution: true }}
      minZoom={0.1}
      fitView
    >
      <Background gap={16} color="#222b36" />
      <Controls showInteractive={false} />
      <MiniMap pannable zoomable nodeColor="#2b3340" maskColor="rgba(10,13,18,0.7)" />
      <Panel position="top-right">
        <button className="toolbar-btn" onClick={() => void arrange(true)}>
          Re-arrange / Fit
        </button>
      </Panel>
    </ReactFlow>
  )
}

export function Canvas({ db }: CanvasProps) {
  return (
    <ReactFlowProvider>
      <Flow db={db} />
    </ReactFlowProvider>
  )
}
