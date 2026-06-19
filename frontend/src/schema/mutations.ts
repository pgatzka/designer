import type { Column, Constraint, Database, ForeignKey, Table } from './types'

/** A new column carries no table identity. */
export type ColumnInput = Column

function updateTable(
  db: Database,
  schemaName: string,
  tableName: string,
  fn: (table: Table) => Table,
): Database {
  return {
    schemas: db.schemas.map((schema) =>
      schema.name !== schemaName
        ? schema
        : { ...schema, tables: schema.tables.map((t) => (t.name === tableName ? fn(t) : t)) },
    ),
  }
}

/** Apply a transform to every table in the database. */
function mapAllTables(db: Database, fn: (table: Table) => Table): Database {
  return { schemas: db.schemas.map((s) => ({ ...s, tables: s.tables.map(fn) })) }
}

/** Does a foreign key's `table` field point at the given (schema, table)? */
function fkTargets(targetTable: string, schemaName: string, tableName: string): boolean {
  return targetTable === tableName || targetTable === `${schemaName}.${tableName}`
}

export function findTable(db: Database, schemaName: string, tableName: string): Table | undefined {
  return db.schemas.find((s) => s.name === schemaName)?.tables.find((t) => t.name === tableName)
}

export function schemaNames(db: Database): string[] {
  return db.schemas.map((s) => s.name)
}

/** All "schema.table" identifiers, used to populate the FK target-table picker. */
export function tableOptions(db: Database): Array<{ schema: string; table: string }> {
  return db.schemas.flatMap((s) => s.tables.map((t) => ({ schema: s.name, table: t.name })))
}

// ---- Columns ---------------------------------------------------------------

export function addColumn(
  db: Database,
  schemaName: string,
  tableName: string,
  column: ColumnInput,
): Database {
  return updateTable(db, schemaName, tableName, (t) => ({ ...t, columns: [...t.columns, column] }))
}

/** Replace a column (matched by `originalName`); renames cascade to constraints and FKs. */
export function updateColumn(
  db: Database,
  schemaName: string,
  tableName: string,
  originalName: string,
  column: ColumnInput,
): Database {
  const renamed = column.name !== originalName
  const rename = (c: string) => (c === originalName ? column.name : c)

  return mapAllTables(db, (t) => {
    // The edited table: swap the column and (if renamed) its local references.
    if (t.schema === schemaName && t.name === tableName) {
      return {
        ...t,
        columns: t.columns.map((c) => (c.name === originalName ? column : c)),
        constraints: renamed
          ? t.constraints.map((k) => ({ ...k, columns: k.columns.map(rename) }))
          : t.constraints,
        foreignKeys: renamed
          ? t.foreignKeys.map((fk) => ({ ...fk, sourceColumns: fk.sourceColumns.map(rename) }))
          : t.foreignKeys,
      }
    }
    // Other tables: update FK target columns that point at the renamed column.
    if (renamed) {
      return {
        ...t,
        foreignKeys: t.foreignKeys.map((fk) =>
          fkTargets(fk.targetTable, schemaName, tableName)
            ? { ...fk, targetColumns: fk.targetColumns.map(rename) }
            : fk,
        ),
      }
    }
    return t
  })
}

export function removeColumn(
  db: Database,
  schemaName: string,
  tableName: string,
  columnName: string,
): Database {
  const without = (cols: string[]) => cols.filter((c) => c !== columnName)

  return mapAllTables(db, (t) => {
    if (t.schema === schemaName && t.name === tableName) {
      return {
        ...t,
        columns: t.columns.filter((c) => c.name !== columnName),
        constraints: t.constraints
          .map((k) => ({ ...k, columns: without(k.columns) }))
          .filter((k) => k.columns.length > 0),
        foreignKeys: t.foreignKeys
          .map((fk) => ({ ...fk, sourceColumns: without(fk.sourceColumns) }))
          .filter((fk) => fk.sourceColumns.length > 0),
      }
    }
    return {
      ...t,
      foreignKeys: t.foreignKeys
        .map((fk) =>
          fkTargets(fk.targetTable, schemaName, tableName)
            ? { ...fk, targetColumns: without(fk.targetColumns) }
            : fk,
        )
        .filter((fk) => fk.targetColumns.length > 0),
    }
  })
}

export function moveColumn(
  db: Database,
  schemaName: string,
  tableName: string,
  columnName: string,
  direction: 'up' | 'down',
): Database {
  return updateTable(db, schemaName, tableName, (t) => {
    const i = t.columns.findIndex((c) => c.name === columnName)
    const j = direction === 'up' ? i - 1 : i + 1
    if (i < 0 || j < 0 || j >= t.columns.length) return t
    const columns = [...t.columns]
    ;[columns[i], columns[j]] = [columns[j], columns[i]]
    return { ...t, columns }
  })
}

// ---- Constraints & foreign keys --------------------------------------------

export function addConstraint(
  db: Database,
  schemaName: string,
  tableName: string,
  constraint: Constraint,
): Database {
  return updateTable(db, schemaName, tableName, (t) => ({
    ...t,
    constraints: [...t.constraints, constraint],
  }))
}

export function removeConstraint(
  db: Database,
  schemaName: string,
  tableName: string,
  name: string,
): Database {
  return updateTable(db, schemaName, tableName, (t) => ({
    ...t,
    constraints: t.constraints.filter((c) => c.name !== name),
  }))
}

export function addForeignKey(
  db: Database,
  schemaName: string,
  tableName: string,
  fk: ForeignKey,
): Database {
  return updateTable(db, schemaName, tableName, (t) => ({
    ...t,
    foreignKeys: [...t.foreignKeys, fk],
  }))
}

export function updateForeignKey(
  db: Database,
  schemaName: string,
  tableName: string,
  originalName: string,
  fk: ForeignKey,
): Database {
  return updateTable(db, schemaName, tableName, (t) => ({
    ...t,
    foreignKeys: t.foreignKeys.map((f) => (f.name === originalName ? fk : f)),
  }))
}

export function removeForeignKey(
  db: Database,
  schemaName: string,
  tableName: string,
  name: string,
): Database {
  return updateTable(db, schemaName, tableName, (t) => ({
    ...t,
    foreignKeys: t.foreignKeys.filter((f) => f.name !== name),
  }))
}

// ---- Tables & schemas ------------------------------------------------------

export function addTable(db: Database, schemaName: string, table: Omit<Table, 'schema'>): Database {
  return {
    schemas: db.schemas.map((s) =>
      s.name !== schemaName ? s : { ...s, tables: [...s.tables, { ...table, schema: schemaName }] },
    ),
  }
}

export function renameTable(
  db: Database,
  schemaName: string,
  oldName: string,
  newName: string,
): Database {
  const retarget = (target: string) =>
    target === oldName
      ? newName
      : target === `${schemaName}.${oldName}`
        ? `${schemaName}.${newName}`
        : target

  return mapAllTables(db, (t) => {
    const renamedHere = t.schema === schemaName && t.name === oldName ? { ...t, name: newName } : t
    return {
      ...renamedHere,
      foreignKeys: renamedHere.foreignKeys.map((fk) => ({
        ...fk,
        targetTable: retarget(fk.targetTable),
      })),
    }
  })
}

export function removeTable(db: Database, schemaName: string, tableName: string): Database {
  const pruned: Database = {
    schemas: db.schemas.map((s) =>
      s.name !== schemaName ? s : { ...s, tables: s.tables.filter((t) => t.name !== tableName) },
    ),
  }
  // Drop foreign keys anywhere that pointed at the removed table.
  return mapAllTables(pruned, (t) => ({
    ...t,
    foreignKeys: t.foreignKeys.filter((fk) => !fkTargets(fk.targetTable, schemaName, tableName)),
  }))
}

export function addSchema(db: Database, name: string): Database {
  if (db.schemas.some((s) => s.name === name)) return db
  return { schemas: [...db.schemas, { name, tables: [] }] }
}

export function renameSchema(db: Database, oldName: string, newName: string): Database {
  const renamed: Database = {
    schemas: db.schemas.map((s) =>
      s.name !== oldName
        ? s
        : { name: newName, tables: s.tables.map((t) => ({ ...t, schema: newName })) },
    ),
  }
  // Update schema-qualified FK targets ("oldName.table" -> "newName.table").
  return mapAllTables(renamed, (t) => ({
    ...t,
    foreignKeys: t.foreignKeys.map((fk) =>
      fk.targetTable.startsWith(`${oldName}.`)
        ? { ...fk, targetTable: `${newName}.${fk.targetTable.slice(oldName.length + 1)}` }
        : fk,
    ),
  }))
}

export function removeSchema(db: Database, name: string): Database {
  const removedTables = new Set(
    (db.schemas.find((s) => s.name === name)?.tables ?? []).map((t) => t.name),
  )
  const pruned: Database = { schemas: db.schemas.filter((s) => s.name !== name) }
  // Drop FKs that pointed into the removed schema (qualified or bare table name).
  return mapAllTables(pruned, (t) => ({
    ...t,
    foreignKeys: t.foreignKeys.filter(
      (fk) => !fk.targetTable.startsWith(`${name}.`) && !removedTables.has(fk.targetTable),
    ),
  }))
}
