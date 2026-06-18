import fs from 'node:fs'
import path from 'node:path'
import fastifyStatic from '@fastify/static'
import type { FastifyInstance } from 'fastify'

/**
 * Serve the built frontend (SPA) in production. In the Docker image the frontend
 * build sits at /app/frontend/dist while the backend runs from /app/backend/dist.
 */
export function registerStatic(app: FastifyInstance): void {
  const candidates = [
    path.resolve(__dirname, '../../frontend/dist'),
    path.resolve(process.cwd(), 'frontend/dist'),
  ]
  const root = candidates.find((p) => fs.existsSync(path.join(p, 'index.html')))

  if (!root) {
    app.log.warn('frontend build not found; static serving disabled (API-only)')
    return
  }

  app.register(fastifyStatic, { root, wildcard: false })

  // SPA fallback: any non-API GET that didn't match a file serves index.html.
  app.setNotFoundHandler((request, reply) => {
    if (request.method === 'GET' && !request.url.startsWith('/api')) {
      return reply.sendFile('index.html')
    }
    return reply.code(404).send({ error: 'Not found' })
  })
}
