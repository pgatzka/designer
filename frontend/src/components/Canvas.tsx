import { useCallback, useEffect, useRef, useState } from 'react'
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
import type { Column, ConstraintType, Database, ForeignKey } from '../schema/types'
import type { Flavor } from '../schema/flavors'
import { toReactFlow, type TableFlowNode } from '../graph/toReactFlow'
import { layoutGraph } from '../layout/elkLayout'
import {
  addColumn,
  addConstraint,
  addForeignKey,
  addSchema,
  addTable,
  findTable,
  moveColumn,
  removeColumn,
  removeForeignKey,
  removeSchema,
  removeTable,
  renameSchema,
  renameTable,
  schemaNames,
  updateColumn,
  updateForeignKey,
} from '../schema/mutations'
import { TableNode } from './TableNode'
import { CanvasActionsContext, type CanvasActions } from './canvasActions'
import { ContextMenu, type MenuItem } from './ContextMenu'
import { ColumnDialog } from './ColumnDialog'
import { ConstraintDialog } from './ConstraintDialog'
import { ForeignKeyDialog, type FkTargetOption } from './ForeignKeyDialog'
import { TableDialog } from './TableDialog'
import { SchemaManagerDialog } from './SchemaManagerDialog'

const nodeTypes = { table: TableNode }

type MenuState =
  | { kind: 'table'; x: number; y: number; schema: string; table: string }
  | { kind: 'column'; x: number; y: number; schema: string; table: string; column: string }
  | { kind: 'pane'; x: number; y: number }
  | null

type DialogState =
  | { kind: 'add-column'; schema: string; table: string }
  | { kind: 'edit-column'; schema: string; table: string; column: Column }
  | { kind: 'add-constraint'; schema: string; table: string; ctype: ConstraintType }
  | { kind: 'add-fk'; schema: string; table: string }
  | { kind: 'edit-fk'; schema: string; table: string; fk: ForeignKey }
  | { kind: 'add-table' }
  | { kind: 'rename-table'; schema: string; table: string }
  | { kind: 'schemas' }
  | null

const CONSTRAINT_PREFIX: Record<ConstraintType, string> = {
  'primary-key': 'pk',
  unique: 'uk',
  index: 'idx',
}

interface CanvasProps {
  db: Database
  flavor?: Flavor
  onChange: (next: Database) => void
}

function Flow({ db, flavor, onChange }: CanvasProps) {
  const [nodes, setNodes, onNodesChange] = useNodesState<TableFlowNode>([])
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([])
  const { fitView } = useReactFlow()
  const runId = useRef(0)

  const [menu, setMenu] = useState<MenuState>(null)
  const [dialog, setDialog] = useState<DialogState>(null)

  const arrange = useCallback(
    async (fit: boolean) => {
      const id = ++runId.current
      const { nodes: rawNodes, edges: rawEdges } = toReactFlow(db)
      const laidOut = await layoutGraph(rawNodes, rawEdges)
      if (id !== runId.current) return
      setNodes(laidOut)
      setEdges(rawEdges)
      if (fit) requestAnimationFrame(() => fitView({ padding: 0.2, duration: 300 }))
    },
    [db, fitView, setNodes, setEdges],
  )

  useEffect(() => {
    void arrange(true)
  }, [arrange])

  const apply = useCallback(
    (next: Database) => {
      onChange(next)
      setDialog(null)
      setMenu(null)
    },
    [onChange],
  )

  const openColumnMenu = useCallback<CanvasActions['openColumnMenu']>(
    (schema, table, column, x, y) => setMenu({ kind: 'column', schema, table, column, x, y }),
    [],
  )

  function buildItems(state: NonNullable<MenuState>): MenuItem[] {
    if (state.kind === 'pane') {
      return [
        { label: 'Add table', onClick: () => setDialog({ kind: 'add-table' }) },
        { label: 'Manage schemas', onClick: () => setDialog({ kind: 'schemas' }) },
      ]
    }
    if (state.kind === 'column') {
      const { schema, table, column } = state
      const col = findTable(db, schema, table)?.columns.find((c) => c.name === column)
      return [
        {
          label: 'Edit column',
          disabled: !col,
          onClick: () => col && setDialog({ kind: 'edit-column', schema, table, column: col }),
        },
        { label: 'Delete column', onClick: () => apply(removeColumn(db, schema, table, column)) },
        { label: 'Move up', onClick: () => apply(moveColumn(db, schema, table, column, 'up')) },
        { label: 'Move down', onClick: () => apply(moveColumn(db, schema, table, column, 'down')) },
      ]
    }
    // table menu
    const { schema, table } = state
    const t = findTable(db, schema, table)
    const fkItems = (make: (fk: ForeignKey) => MenuItem) => (t?.foreignKeys ?? []).map(make)
    const items: MenuItem[] = [
      {
        label: 'Add',
        submenu: [
          { label: 'Column', onClick: () => setDialog({ kind: 'add-column', schema, table }) },
          {
            label: 'Primary key',
            onClick: () =>
              setDialog({ kind: 'add-constraint', schema, table, ctype: 'primary-key' }),
          },
          {
            label: 'Unique',
            onClick: () => setDialog({ kind: 'add-constraint', schema, table, ctype: 'unique' }),
          },
          {
            label: 'Index',
            onClick: () => setDialog({ kind: 'add-constraint', schema, table, ctype: 'index' }),
          },
          { label: 'Foreign key', onClick: () => setDialog({ kind: 'add-fk', schema, table }) },
        ],
      },
    ]
    if (t && t.foreignKeys.length > 0) {
      items.push({
        label: 'Edit foreign key',
        submenu: fkItems((fk) => ({
          label: fk.name,
          onClick: () => setDialog({ kind: 'edit-fk', schema, table, fk }),
        })),
      })
      items.push({
        label: 'Delete foreign key',
        submenu: fkItems((fk) => ({
          label: fk.name,
          onClick: () => apply(removeForeignKey(db, schema, table, fk.name)),
        })),
      })
    }
    items.push({
      label: 'Rename table',
      onClick: () => setDialog({ kind: 'rename-table', schema, table }),
    })
    items.push({
      label: 'Delete table',
      onClick: () => {
        if (window.confirm(`Delete table "${table}" and its foreign keys?`)) {
          apply(removeTable(db, schema, table))
        } else {
          setMenu(null)
        }
      },
    })
    return items
  }

  return (
    <CanvasActionsContext.Provider value={{ openColumnMenu }}>
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
        onNodeContextMenu={(e, node) => {
          e.preventDefault()
          const data = (node as TableFlowNode).data
          setMenu({
            kind: 'table',
            x: e.clientX,
            y: e.clientY,
            schema: data.table.schema,
            table: data.table.name,
          })
        }}
        onPaneContextMenu={(e) => {
          e.preventDefault()
          const ev = e as MouseEvent
          setMenu({ kind: 'pane', x: ev.clientX, y: ev.clientY })
        }}
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

      {menu && (
        <ContextMenu x={menu.x} y={menu.y} items={buildItems(menu)} onClose={() => setMenu(null)} />
      )}

      {dialog && renderDialog(dialog, db, apply, () => setDialog(null), onChange, flavor)}
    </CanvasActionsContext.Provider>
  )
}

function renderDialog(
  dialog: NonNullable<DialogState>,
  db: Database,
  apply: (next: Database) => void,
  close: () => void,
  onChange: (next: Database) => void,
  flavor: Flavor | undefined,
) {
  switch (dialog.kind) {
    case 'add-column': {
      const t = findTable(db, dialog.schema, dialog.table)
      return (
        <ColumnDialog
          title="Add column"
          tableLabel={`${dialog.schema}.${dialog.table}`}
          taken={t?.columns.map((c) => c.name) ?? []}
          flavor={flavor}
          onCancel={close}
          onSubmit={(col) => apply(addColumn(db, dialog.schema, dialog.table, col))}
        />
      )
    }
    case 'edit-column': {
      const t = findTable(db, dialog.schema, dialog.table)
      return (
        <ColumnDialog
          title="Edit column"
          tableLabel={`${dialog.schema}.${dialog.table}`}
          initial={dialog.column}
          taken={(t?.columns.map((c) => c.name) ?? []).filter((n) => n !== dialog.column.name)}
          flavor={flavor}
          onCancel={close}
          onSubmit={(col) =>
            apply(updateColumn(db, dialog.schema, dialog.table, dialog.column.name, col))
          }
        />
      )
    }
    case 'add-constraint': {
      const t = findTable(db, dialog.schema, dialog.table)
      return (
        <ConstraintDialog
          type={dialog.ctype}
          tableLabel={`${dialog.schema}.${dialog.table}`}
          columns={t?.columns.map((c) => c.name) ?? []}
          taken={t?.constraints.map((c) => c.name) ?? []}
          defaultName={`${CONSTRAINT_PREFIX[dialog.ctype]}_${dialog.table}`}
          onCancel={close}
          onSubmit={(c) => apply(addConstraint(db, dialog.schema, dialog.table, c))}
        />
      )
    }
    case 'add-fk':
    case 'edit-fk': {
      const t = findTable(db, dialog.schema, dialog.table)
      const targets: FkTargetOption[] = db.schemas.flatMap((s) =>
        s.tables.map((tbl) => ({
          value: tbl.name,
          label: `${s.name}.${tbl.name}`,
          columns: tbl.columns.map((c) => c.name),
        })),
      )
      const isEdit = dialog.kind === 'edit-fk'
      return (
        <ForeignKeyDialog
          tableLabel={`${dialog.schema}.${dialog.table}`}
          sourceColumns={t?.columns.map((c) => c.name) ?? []}
          targets={targets}
          taken={(t?.foreignKeys.map((f) => f.name) ?? []).filter(
            (n) => !isEdit || n !== dialog.fk.name,
          )}
          initial={isEdit ? dialog.fk : undefined}
          defaultName={`fk_${dialog.table}`}
          onCancel={close}
          onSubmit={(fk) =>
            apply(
              isEdit
                ? updateForeignKey(db, dialog.schema, dialog.table, dialog.fk.name, fk)
                : addForeignKey(db, dialog.schema, dialog.table, fk),
            )
          }
        />
      )
    }
    case 'rename-table': {
      const names: Record<string, string[]> = {}
      for (const s of db.schemas) names[s.name] = s.tables.map((t) => t.name)
      return (
        <TableDialog
          mode="rename"
          schemas={schemaNames(db)}
          defaultSchema={dialog.schema}
          tablesBySchema={names}
          initialName={dialog.table}
          onCancel={close}
          onSubmit={({ name }) => apply(renameTable(db, dialog.schema, dialog.table, name))}
        />
      )
    }
    case 'add-table': {
      const names: Record<string, string[]> = {}
      for (const s of db.schemas) names[s.name] = s.tables.map((t) => t.name)
      return (
        <TableDialog
          mode="add"
          schemas={schemaNames(db)}
          defaultSchema={db.schemas[0]?.name ?? 'public'}
          tablesBySchema={names}
          onCancel={close}
          onSubmit={({ name, schema }) => {
            let next = schemaNames(db).includes(schema) ? db : addSchema(db, schema)
            next = addTable(next, schema, { name, columns: [], constraints: [], foreignKeys: [] })
            apply(next)
          }}
        />
      )
    }
    case 'schemas':
      return (
        <SchemaManagerDialog
          schemas={schemaNames(db)}
          onAdd={(name) => onChange(addSchema(db, name))}
          onRename={(oldName, newName) => onChange(renameSchema(db, oldName, newName))}
          onDelete={(name) => {
            if (window.confirm(`Delete schema "${name}" and all its tables?`)) {
              onChange(removeSchema(db, name))
            }
          }}
          onClose={close}
        />
      )
  }
}

export function Canvas({ db, flavor, onChange }: CanvasProps) {
  return (
    <ReactFlowProvider>
      <Flow db={db} flavor={flavor} onChange={onChange} />
    </ReactFlowProvider>
  )
}
