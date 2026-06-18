import { Handle, Position, type NodeProps } from '@xyflow/react'
import type { TableFlowNode } from '../graph/toReactFlow'
import { sourceHandleId, targetHandleId, type ColumnBadges } from '../graph/toReactFlow'
import { HEADER_HEIGHT, NODE_WIDTH, ROW_HEIGHT } from '../graph/dimensions'

function badgeList(b: ColumnBadges): string[] {
  const out: string[] = []
  if (b.pk) out.push('PK')
  if (b.fk) out.push('FK')
  if (b.uq) out.push('UQ')
  if (b.ix) out.push('IX')
  return out
}

export function TableNode({ data }: NodeProps<TableFlowNode>) {
  const { table, badges } = data

  return (
    <div className="table-node" style={{ width: NODE_WIDTH }}>
      <div className="table-node__header" style={{ height: HEADER_HEIGHT }}>
        <span className="table-node__schema">{table.schema}.</span>
        <span className="table-node__name">{table.name}</span>
      </div>
      <div className="table-node__rows">
        {table.columns.map((col) => {
          const b = badges[col.name] ?? { pk: false, uq: false, ix: false, fk: false }
          const tags = badgeList(b)
          return (
            <div key={col.name} className="table-node__row" style={{ height: ROW_HEIGHT }}>
              <Handle
                type="target"
                position={Position.Left}
                id={targetHandleId(col.name)}
                className="table-node__handle"
              />
              <span className={`table-node__col${b.pk ? ' is-pk' : ''}`}>{col.name}</span>
              <span className="table-node__type">
                {col.type}
                {col.length != null ? `(${col.length})` : ''}
                {!col.nullable ? ' ·' : ''}
              </span>
              <span className="table-node__badges">
                {tags.map((t) => (
                  <span key={t} className={`badge badge--${t.toLowerCase()}`}>
                    {t}
                  </span>
                ))}
              </span>
              <Handle
                type="source"
                position={Position.Right}
                id={sourceHandleId(col.name)}
                className="table-node__handle"
              />
            </div>
          )
        })}
      </div>
    </div>
  )
}
