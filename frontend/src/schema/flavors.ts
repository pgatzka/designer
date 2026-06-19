/**
 * Database "flavors" (PostgreSQL / MySQL / SQL Server) and their column-type
 * catalogs. A design's flavor is chosen at creation and is immutable; it is
 * design metadata, not part of the editable YAML. The catalog drives strict
 * type validation in {@link ./parse} — an unknown type, or a length that
 * violates the type's length rule, is a parse error.
 */

/** Whether a type forbids, allows, or requires a `length` (e.g. `varchar(25)`). */
export type LengthRule = 'forbidden' | 'optional' | 'required'

export type FlavorId = 'postgres' | 'mysql' | 'sqlserver'

export interface TypeDef {
  name: string
  length: LengthRule
}

export interface Flavor {
  id: FlavorId
  label: string
  types: TypeDef[]
}

const def = (length: LengthRule, names: string[]): TypeDef[] =>
  names.map((name) => ({ name, length }))

export const FLAVORS: Record<FlavorId, Flavor> = {
  postgres: {
    id: 'postgres',
    label: 'PostgreSQL',
    types: [
      ...def('optional', ['varchar', 'char', 'numeric', 'decimal']),
      ...def('forbidden', [
        'smallint',
        'integer',
        'bigint',
        'serial',
        'bigserial',
        'boolean',
        'text',
        'real',
        'double precision',
        'date',
        'time',
        'timestamp',
        'timestamptz',
        'uuid',
        'json',
        'jsonb',
        'bytea',
      ]),
    ],
  },
  mysql: {
    id: 'mysql',
    label: 'MySQL',
    types: [
      ...def('required', ['varchar', 'char']),
      ...def('optional', ['decimal', 'numeric']),
      ...def('forbidden', [
        'tinyint',
        'smallint',
        'int',
        'bigint',
        'boolean',
        'text',
        'mediumtext',
        'longtext',
        'date',
        'datetime',
        'timestamp',
        'time',
        'json',
        'blob',
        'double',
        'float',
      ]),
    ],
  },
  sqlserver: {
    id: 'sqlserver',
    label: 'SQL Server',
    types: [
      ...def('required', ['varchar', 'nvarchar', 'char', 'nchar']),
      ...def('optional', ['decimal', 'numeric']),
      ...def('forbidden', [
        'int',
        'bigint',
        'smallint',
        'tinyint',
        'bit',
        'date',
        'datetime',
        'datetime2',
        'time',
        'uniqueidentifier',
        'text',
        'money',
        'float',
        'real',
      ]),
    ],
  },
}

export function isFlavorId(id: unknown): id is FlavorId {
  return typeof id === 'string' && id in FLAVORS
}

export function getFlavor(id: string | undefined): Flavor | undefined {
  return id != null && isFlavorId(id) ? FLAVORS[id] : undefined
}

/** The catalog's type names (in declared order) — used to populate pickers. */
export function typeNames(flavor: Flavor): string[] {
  return flavor.types.map((t) => t.name)
}

/**
 * Validate a column's type (and its length) against a flavor's catalog.
 * Returns an error message, or `null` when the column is valid. Type names are
 * matched case-insensitively.
 */
export function validateColumnType(
  flavor: Flavor,
  type: string,
  length: number | undefined,
): string | null {
  const def = flavor.types.find((t) => t.name === type.toLowerCase())
  if (!def) {
    return `unknown ${flavor.label} type "${type}"`
  }
  const hasLength = length != null
  if (def.length === 'required' && !hasLength) {
    return `${flavor.label} type "${type}" requires a length`
  }
  if (def.length === 'forbidden' && hasLength) {
    return `${flavor.label} type "${type}" does not take a length`
  }
  return null
}
