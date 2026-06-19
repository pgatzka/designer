import yaml from 'js-yaml'
import type {
  Column,
  Constraint,
  ConstraintType,
  Database,
  ForeignKey,
  ParseError,
  ParseResult,
  SchemaNs,
  Table,
} from './types'
import { getFlavor, validateColumnType, type Flavor } from './flavors'

const CONSTRAINT_TYPES: ConstraintType[] = ['primary-key', 'unique', 'index']

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** Normalize a YAML scalar-or-list field into a string[] (dropping empties). */
function toStringList(value: unknown): string[] {
  if (value == null) return []
  const items = Array.isArray(value) ? value : [value]
  return items.map((v) => String(v)).filter((s) => s.length > 0)
}

const EMPTY_DB: Database = { schemas: [] }

/**
 * Parse the YAML source into a {@link Database}, collecting validation errors
 * instead of throwing. On a YAML syntax error an empty database is returned with
 * a single error describing it.
 *
 * When `flavorId` resolves to a known flavor, each column's type and length are
 * validated against that flavor's catalog (strict). Without a flavor (legacy /
 * initial bootstrap) type validation is skipped.
 */
export function parse(text: string, flavorId?: string): ParseResult {
  const errors: ParseError[] = []
  const flavor = getFlavor(flavorId)

  let doc: unknown
  try {
    doc = yaml.load(text)
  } catch (e) {
    const mark = (e as { mark?: { line: number } }).mark
    const where = mark ? ` (line ${mark.line + 1})` : ''
    return {
      db: EMPTY_DB,
      errors: [{ path: 'database', message: `YAML syntax error${where}: ${(e as Error).message}` }],
    }
  }

  if (doc == null) return { db: EMPTY_DB, errors }

  if (!isRecord(doc) || !isRecord(doc.database)) {
    errors.push({ path: 'database', message: 'expected a top-level "database" mapping' })
    return { db: EMPTY_DB, errors }
  }

  const schemasNode = doc.database.schemas
  if (!isRecord(schemasNode)) {
    errors.push({ path: 'database.schemas', message: 'expected a "schemas" mapping' })
    return { db: EMPTY_DB, errors }
  }

  const schemas: SchemaNs[] = []
  for (const schemaName of Object.keys(schemasNode)) {
    const schemaNode = schemasNode[schemaName]
    const schemaPath = `database.schemas.${schemaName}`
    if (!isRecord(schemaNode)) {
      errors.push({ path: schemaPath, message: 'expected a schema mapping' })
      continue
    }
    const tables = parseTables(schemaName, schemaNode.tables, schemaPath, errors, flavor)
    schemas.push({ name: schemaName, tables })
  }

  const db: Database = { schemas }
  validateReferences(db, errors)
  return { db, errors }
}

function parseTables(
  schemaName: string,
  tablesNode: unknown,
  schemaPath: string,
  errors: ParseError[],
  flavor: Flavor | undefined,
): Table[] {
  if (tablesNode == null) return []
  if (!isRecord(tablesNode)) {
    errors.push({ path: `${schemaPath}.tables`, message: 'expected a "tables" mapping' })
    return []
  }

  const tables: Table[] = []
  for (const tableName of Object.keys(tablesNode)) {
    const tableNode = tablesNode[tableName]
    const tablePath = `${schemaPath}.tables.${tableName}`
    if (!isRecord(tableNode)) {
      errors.push({ path: tablePath, message: 'expected a table mapping' })
      continue
    }
    tables.push({
      schema: schemaName,
      name: tableName,
      columns: parseColumns(tableNode.columns, tablePath, errors, flavor),
      constraints: parseConstraints(tableNode, tablePath, errors),
      foreignKeys: parseForeignKeys(tableNode['foreign-keys'], tablePath, errors),
    })
  }
  return tables
}

function parseColumns(
  columnsNode: unknown,
  tablePath: string,
  errors: ParseError[],
  flavor: Flavor | undefined,
): Column[] {
  if (columnsNode == null) return []
  if (!isRecord(columnsNode)) {
    errors.push({ path: `${tablePath}.columns`, message: 'expected a "columns" mapping' })
    return []
  }

  const columns: Column[] = []
  for (const columnName of Object.keys(columnsNode)) {
    const node = columnsNode[columnName]
    const path = `${tablePath}.columns.${columnName}`
    if (!isRecord(node)) {
      errors.push({ path, message: 'expected a column mapping' })
      continue
    }

    const hasType = typeof node.type === 'string' && node.type.length > 0
    if (!hasType) {
      errors.push({ path: `${path}.type`, message: 'column is missing a string "type"' })
    }
    const hasLength = node.length != null && typeof node.length === 'number'
    if (node.length != null && typeof node.length !== 'number') {
      errors.push({ path: `${path}.length`, message: '"length" must be a number' })
    }
    if (node.nullable != null && typeof node.nullable !== 'boolean') {
      errors.push({ path: `${path}.nullable`, message: '"nullable" must be a boolean' })
    }

    // Strict per-flavor type validation (only when the type/length are well-formed).
    if (flavor && hasType) {
      const message = validateColumnType(
        flavor,
        node.type as string,
        hasLength ? (node.length as number) : undefined,
      )
      if (message) errors.push({ path: `${path}.type`, message })
    }

    columns.push({
      name: columnName,
      type: typeof node.type === 'string' ? node.type : 'unknown',
      length: typeof node.length === 'number' ? node.length : undefined,
      nullable: node.nullable === false ? false : true,
    })
  }
  return columns
}

/** Parse the "constraints" mapping, merging the legacy "indices" alias. */
function parseConstraints(
  tableNode: Record<string, unknown>,
  tablePath: string,
  errors: ParseError[],
): Constraint[] {
  const constraints: Constraint[] = []
  for (const key of ['constraints', 'indices']) {
    const node = tableNode[key]
    if (node == null) continue
    if (!isRecord(node)) {
      errors.push({ path: `${tablePath}.${key}`, message: `expected a "${key}" mapping` })
      continue
    }
    for (const name of Object.keys(node)) {
      const c = node[name]
      const path = `${tablePath}.${key}.${name}`
      if (!isRecord(c)) {
        errors.push({ path, message: 'expected a constraint mapping' })
        continue
      }
      const type = c.type
      if (typeof type !== 'string' || !CONSTRAINT_TYPES.includes(type as ConstraintType)) {
        errors.push({
          path: `${path}.type`,
          message: `"type" must be one of ${CONSTRAINT_TYPES.join(', ')}`,
        })
        continue
      }
      constraints.push({ name, type: type as ConstraintType, columns: toStringList(c.columns) })
    }
  }
  return constraints
}

/**
 * Resolve a foreign-key column reference: the singular key (`source-column` /
 * `target-column`) is a single scalar; the plural key (`source-columns` /
 * `target-columns`) is a list. Exactly one of the pair must be present.
 */
function parseColumnRef(
  node: Record<string, unknown>,
  path: string,
  singularKey: string,
  pluralKey: string,
  errors: ParseError[],
): string[] {
  const hasSingular = node[singularKey] != null
  const hasPlural = node[pluralKey] != null

  if (hasSingular && hasPlural) {
    errors.push({ path, message: `use either "${singularKey}" or "${pluralKey}", not both` })
    return []
  }
  if (hasSingular) {
    const value = node[singularKey]
    if (typeof value !== 'string') {
      errors.push({
        path: `${path}.${singularKey}`,
        message: `"${singularKey}" must be a single column name (use "${pluralKey}" for a list)`,
      })
      return []
    }
    return [value]
  }
  if (hasPlural) {
    const value = node[pluralKey]
    if (!Array.isArray(value)) {
      errors.push({
        path: `${path}.${pluralKey}`,
        message: `"${pluralKey}" must be a list of column names`,
      })
      return []
    }
    return value.map((v) => String(v)).filter((s) => s.length > 0)
  }
  errors.push({ path, message: `foreign key is missing "${singularKey}" or "${pluralKey}"` })
  return []
}

function parseForeignKeys(fkNode: unknown, tablePath: string, errors: ParseError[]): ForeignKey[] {
  if (fkNode == null) return []
  if (!isRecord(fkNode)) {
    errors.push({ path: `${tablePath}.foreign-keys`, message: 'expected a "foreign-keys" mapping' })
    return []
  }

  const fks: ForeignKey[] = []
  for (const name of Object.keys(fkNode)) {
    const node = fkNode[name]
    const path = `${tablePath}.foreign-keys.${name}`
    if (!isRecord(node)) {
      errors.push({ path, message: 'expected a foreign-key mapping' })
      continue
    }
    if (typeof node.table !== 'string' || node.table.length === 0) {
      errors.push({ path: `${path}.table`, message: 'foreign key is missing a target "table"' })
      continue
    }
    fks.push({
      name,
      sourceColumns: parseColumnRef(node, path, 'source-column', 'source-columns', errors),
      targetTable: node.table,
      targetColumns: parseColumnRef(node, path, 'target-column', 'target-columns', errors),
    })
  }
  return fks
}

/** Cross-check that constraint and foreign-key columns/tables actually exist. */
function validateReferences(db: Database, errors: ParseError[]): void {
  const tableIndex = new Map<string, Table>()
  for (const schema of db.schemas) {
    for (const table of schema.tables) {
      tableIndex.set(`${schema.name}.${table.name}`, table)
      // Also index by bare name for unqualified references (last one wins).
      tableIndex.set(table.name, table)
    }
  }

  for (const schema of db.schemas) {
    for (const table of schema.tables) {
      const cols = new Set(table.columns.map((c) => c.name))
      const base = `database.schemas.${schema.name}.tables.${table.name}`

      for (const c of table.constraints) {
        for (const col of c.columns) {
          if (!cols.has(col)) {
            errors.push({
              path: `${base}.constraints.${c.name}`,
              message: `references unknown column "${col}"`,
            })
          }
        }
      }

      for (const fk of table.foreignKeys) {
        const fkPath = `${base}.foreign-keys.${fk.name}`
        for (const col of fk.sourceColumns) {
          if (!cols.has(col)) {
            errors.push({ path: fkPath, message: `unknown source column "${col}"` })
          }
        }
        const target =
          tableIndex.get(`${schema.name}.${fk.targetTable}`) ?? tableIndex.get(fk.targetTable)
        if (!target) {
          errors.push({ path: fkPath, message: `unknown target table "${fk.targetTable}"` })
          continue
        }
        const targetCols = new Set(target.columns.map((c) => c.name))
        for (const col of fk.targetColumns) {
          if (!targetCols.has(col)) {
            errors.push({
              path: fkPath,
              message: `unknown target column "${fk.targetTable}.${col}"`,
            })
          }
        }
      }
    }
  }
}
