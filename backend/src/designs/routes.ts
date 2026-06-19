import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import { createDesignSchema, updateDesignSchema } from './schema'
import type { DesignRepository } from './types'

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

export function registerDesignRoutes(app: FastifyInstance, designs: DesignRepository): void {
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
