import { z } from 'zod'

const columnSchema = z.object({
  name: z.string().min(1),
  type: z.string().min(1),
  length: z.number().int().positive().optional(),
  nullable: z.boolean(),
})

const constraintSchema = z.object({
  name: z.string().min(1),
  type: z.enum(['primary-key', 'unique', 'index']),
  columns: z.array(z.string()),
})

const foreignKeySchema = z.object({
  name: z.string().min(1),
  sourceColumns: z.array(z.string()),
  targetTable: z.string().min(1),
  targetColumns: z.array(z.string()),
})

const tableSchema = z.object({
  name: z.string().min(1),
  columns: z.array(columnSchema),
  constraints: z.array(constraintSchema),
  foreignKeys: z.array(foreignKeySchema),
})

const schemaNsSchema = z.object({
  name: z.string().min(1),
  tables: z.array(tableSchema),
})

export const databaseSchema = z.object({
  schemas: z.array(schemaNsSchema),
})

export const designNameSchema = z.string().trim().min(1, 'Name is required').max(120)

export const createDesignSchema = z.object({
  name: designNameSchema,
  database: databaseSchema,
})

export const updateDesignSchema = z
  .object({
    name: designNameSchema.optional(),
    database: databaseSchema.optional(),
  })
  .refine((v) => v.name !== undefined || v.database !== undefined, {
    message: 'Nothing to update',
  })
