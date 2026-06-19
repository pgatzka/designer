import type {
  Column,
  Constraint,
  Database,
  FlavorId,
  ForeignKey,
  RawColumn,
  RawSchema,
  SchemaNs,
  Table,
} from './types'

/**
 * Native catalog type → flavor catalog type name. Targets the names declared in
 * `frontend/src/schema/flavors.ts` so imported designs pass strict validation.
 * Length-bearing types (varchar/char/nvarchar/nchar) take the column's
 * `charMaxLength`; everything else drops length. Unmapped types fall through as
 * the lowercased native name (the user can fix them in the editor).
 */
const TYPE_MAP: Record<FlavorId, Record<string, string>> = {
  postgres: {
    'character varying': 'varchar',
    varchar: 'varchar',
    character: 'char',
    char: 'char',
    bpchar: 'char',
    numeric: 'numeric',
    decimal: 'decimal',
    smallint: 'smallint',
    int2: 'smallint',
    integer: 'integer',
    int: 'integer',
    int4: 'integer',
    bigint: 'bigint',
    int8: 'bigint',
    serial: 'serial',
    bigserial: 'bigserial',
    boolean: 'boolean',
    bool: 'boolean',
    text: 'text',
    real: 'real',
    float4: 'real',
    'double precision': 'double precision',
    float8: 'double precision',
    date: 'date',
    time: 'time',
    'time without time zone': 'time',
    timestamp: 'timestamp',
    'timestamp without time zone': 'timestamp',
    'timestamp with time zone': 'timestamptz',
    timestamptz: 'timestamptz',
    uuid: 'uuid',
    json: 'json',
    jsonb: 'jsonb',
    bytea: 'bytea',
  },
  mysql: {
    varchar: 'varchar',
    char: 'char',
    decimal: 'decimal',
    numeric: 'numeric',
    tinyint: 'tinyint',
    smallint: 'smallint',
    mediumint: 'int',
    int: 'int',
    integer: 'int',
    bigint: 'bigint',
    boolean: 'boolean',
    bool: 'boolean',
    text: 'text',
    tinytext: 'text',
    mediumtext: 'mediumtext',
    longtext: 'longtext',
    date: 'date',
    datetime: 'datetime',
    timestamp: 'timestamp',
    time: 'time',
    json: 'json',
    blob: 'blob',
    tinyblob: 'blob',
    mediumblob: 'blob',
    longblob: 'blob',
    double: 'double',
    float: 'float',
  },
  sqlserver: {
    varchar: 'varchar',
    nvarchar: 'nvarchar',
    char: 'char',
    nchar: 'nchar',
    decimal: 'decimal',
    numeric: 'numeric',
    int: 'int',
    bigint: 'bigint',
    smallint: 'smallint',
    tinyint: 'tinyint',
    bit: 'bit',
    date: 'date',
    datetime: 'datetime',
    datetime2: 'datetime2',
    smalldatetime: 'datetime',
    time: 'time',
    uniqueidentifier: 'uniqueidentifier',
    text: 'text',
    ntext: 'text',
    money: 'money',
    smallmoney: 'money',
    float: 'float',
    real: 'real',
  },
}

/** Types whose `length` is meaningful in the flavor catalogs. */
const LENGTH_TYPES = new Set(['varchar', 'char', 'nvarchar', 'nchar'])

/**
 * Map a raw column's native type to a flavor catalog type and (where relevant)
 * length. `charMaxLength` of `-1`/`0` means "MAX" (SQL Server) — degrade to
 * `text`, which takes no length, so the result still validates.
 */
export function normalizeColumnType(
  flavor: FlavorId,
  col: RawColumn,
): { type: string; length?: number } {
  const native = col.dataType.trim().toLowerCase()
  const mapped = TYPE_MAP[flavor][native] ?? native

  if (LENGTH_TYPES.has(mapped)) {
    if (col.charMaxLength != null && col.charMaxLength > 0) {
      return { type: mapped, length: col.charMaxLength }
    }
    // varchar(max) / nvarchar(max) and friends have no finite length.
    return { type: 'text' }
  }
  return { type: mapped }
}

/** A "schema.table" key, used to group rows and resolve FK targets. */
function key(schema: string, table: string): string {
  return `${schema}.${table}`
}

/**
 * Assemble the flat introspection result into the normalized {@link Database}.
 * Columns keep catalog order (`position`); foreign keys point at the bare table
 * name within the same schema, or `"schema.table"` across schemas.
 */
export function assembleDatabase(flavor: FlavorId, raw: RawSchema): Database {
  const schemaOrder: string[] = []
  const tablesBySchema = new Map<string, Map<string, Table>>()

  const ensureTable = (schema: string, table: string): Table => {
    let tables = tablesBySchema.get(schema)
    if (!tables) {
      tables = new Map()
      tablesBySchema.set(schema, tables)
      schemaOrder.push(schema)
    }
    let t = tables.get(table)
    if (!t) {
      t = { name: table, columns: [], constraints: [], foreignKeys: [] }
      tables.set(table, t)
    }
    return t
  }

  const columns = [...raw.columns].sort((a, b) => a.position - b.position)
  for (const c of columns) {
    const { type, length } = normalizeColumnType(flavor, c)
    const column: Column = { name: c.name, type, nullable: c.nullable }
    if (length != null) column.length = length
    ensureTable(c.schema, c.table).columns.push(column)
  }

  for (const k of raw.constraints) {
    const constraint: Constraint = { name: k.name, type: k.type, columns: k.columns }
    ensureTable(k.schema, k.table).constraints.push(constraint)
  }

  for (const fk of raw.foreignKeys) {
    const targetTable =
      fk.targetSchema === fk.schema ? fk.targetTable : key(fk.targetSchema, fk.targetTable)
    const foreignKey: ForeignKey = {
      name: fk.name,
      sourceColumns: fk.columns,
      targetTable,
      targetColumns: fk.targetColumns,
    }
    ensureTable(fk.schema, fk.table).foreignKeys.push(foreignKey)
  }

  const schemas: SchemaNs[] = schemaOrder.map((name) => ({
    name,
    tables: [...(tablesBySchema.get(name) ?? new Map<string, Table>()).values()],
  }))
  return { schemas }
}
