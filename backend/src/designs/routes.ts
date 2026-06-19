import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import { createDesignSchema, importDesignSchema, updateDesignSchema } from './schema'
import { assembleDatabase } from './introspect'
import { describeError } from '../errors'
import type { DesignRepository, SchemaInspector } from './types'

function tableCount(db: { schemas: Array<{ tables: unknown[] }> }): number {
  return db.schemas.reduce((n, s) => n + s.tables.length, 0)
}

function userId(request: FastifyRequest): string {
  return (request.user as { sub: string }).sub
}

/** preHandler that requires a valid session cookie. */
async function requireAuth(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  try {
    await request.jwtVerify()
  } catch {
    await reply.code(401).send({ error: 'Not authenticated' })
  }
}

export function registerDesignRoutes(
  app: FastifyInstance,
  designs: DesignRepository,
  inspector: SchemaInspector,
): void {
  app.get('/api/designs', { preHandler: requireAuth }, async (request) => {
    return { designs: await designs.listByUser(userId(request)) }
  })

  app.post('/api/designs', { preHandler: requireAuth }, async (request, reply) => {
    const parsed = createDesignSchema.safeParse(request.body)
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.issues[0]?.message ?? 'Invalid design' })
    }
    const design = await designs.create(
      userId(request),
      parsed.data.name,
      parsed.data.flavor,
      parsed.data.database,
    )
    return reply.code(201).send({ design })
  })

  app.post('/api/designs/import', { preHandler: requireAuth }, async (request, reply) => {
    const parsed = importDesignSchema.safeParse(request.body)
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.issues[0]?.message ?? 'Invalid request' })
    }
    const { name, flavor, connection } = parsed.data
    const where = {
      flavor,
      host: connection.host,
      port: connection.port,
      database: connection.database,
      user: connection.user,
      ssl: !!connection.ssl,
    }
    request.log.info(where, 'schema import requested')

    try {
      const raw = await inspector.inspect({ flavor, ...connection }, request.log)
      const database = assembleDatabase(flavor, raw)
      request.log.info(
        { ...where, schemas: database.schemas.length, tables: tableCount(database) },
        'source schema introspected',
      )
      const design = await designs.create(userId(request), name, flavor, database)
      request.log.info({ designId: design.id }, 'schema import succeeded')
      return reply.code(201).send({ design })
    } catch (err) {
      request.log.error({ err, ...where }, 'schema import failed')
      return reply.code(400).send({ error: `Import failed: ${describeError(err)}` })
    }
  })

  app.get('/api/designs/:id', { preHandler: requireAuth }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const design = await designs.get(userId(request), id)
    if (!design) return reply.code(404).send({ error: 'Design not found' })
    return { design }
  })

  app.put('/api/designs/:id', { preHandler: requireAuth }, async (request, reply) => {
    const parsed = updateDesignSchema.safeParse(request.body)
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.issues[0]?.message ?? 'Invalid update' })
    }
    const { id } = request.params as { id: string }
    const design = await designs.update(userId(request), id, parsed.data)
    if (!design) return reply.code(404).send({ error: 'Design not found' })
    return { design }
  })

  app.delete('/api/designs/:id', { preHandler: requireAuth }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const removed = await designs.remove(userId(request), id)
    if (!removed) return reply.code(404).send({ error: 'Design not found' })
    return reply.code(204).send()
  })
}
