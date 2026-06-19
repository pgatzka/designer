import cookie from '@fastify/cookie'
import jwt from '@fastify/jwt'
import Fastify, { type FastifyInstance } from 'fastify'
import { registerAuthRoutes } from './auth/routes'
import { AuthService } from './auth/service'
import { SESSION_COOKIE } from './auth/routes'
import type { UserRepository } from './auth/types'
import { registerDesignRoutes } from './designs/routes'
import type { DesignRepository, SchemaInspector } from './designs/types'
import { DriverSchemaInspector } from './db/introspect'

export interface AppOptions {
  jwtSecret: string
  userRepository: UserRepository
  designRepository: DesignRepository
  /** Source-DB introspector for schema import; defaults to the real driver-backed one. */
  schemaInspector?: SchemaInspector
  logger?: boolean
}

/** Build a Fastify app with auth wired up. The user repository is injected so tests
 * can supply an in-memory fake. */
export function buildApp(opts: AppOptions): FastifyInstance {
  const app = Fastify({ logger: opts.logger ?? false })

  app.register(cookie)
  app.register(jwt, {
    secret: opts.jwtSecret,
    cookie: { cookieName: SESSION_COOKIE, signed: false },
  })

  const authService = new AuthService(opts.userRepository)
  registerAuthRoutes(app, authService)
  registerDesignRoutes(
    app,
    opts.designRepository,
    opts.schemaInspector ?? new DriverSchemaInspector(),
  )

  return app
}
