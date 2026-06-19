import cookie from '@fastify/cookie'
import jwt from '@fastify/jwt'
import Fastify, {
  type FastifyError,
  type FastifyInstance,
  type FastifyServerOptions,
} from 'fastify'
import type { Logger as PinoLogger } from 'pino'
import { registerAuthRoutes } from './auth/routes'
import { AuthService } from './auth/service'
import { SESSION_COOKIE } from './auth/routes'
import type { UserRepository } from './auth/types'
import { registerDesignRoutes } from './designs/routes'
import type { DesignRepository, SchemaInspector } from './designs/types'
import { DriverSchemaInspector } from './db/introspect'
import { describeError } from './errors'

export interface AppOptions {
  jwtSecret: string
  userRepository: UserRepository
  designRepository: DesignRepository
  /** Source-DB introspector for schema import; defaults to the real driver-backed one. */
  schemaInspector?: SchemaInspector
  /** `false` (default, used by tests) disables logging; pass a pino instance to enable. */
  logger?: boolean | PinoLogger
}

/** Build a Fastify app with auth wired up. The repositories and logger are injected so
 * tests can supply in-memory fakes and keep logging quiet. */
export function buildApp(opts: AppOptions): FastifyInstance {
  // Fastify v5 takes a prebuilt logger via `loggerInstance`; `logger` is only a
  // boolean/config object. Tests pass `false` (or omit) to stay quiet.
  const loggerOpts: Pick<FastifyServerOptions, 'logger' | 'loggerInstance'> =
    typeof opts.logger === 'object' && opts.logger !== null
      ? { loggerInstance: opts.logger }
      : { logger: opts.logger ?? false }
  const app = Fastify(loggerOpts)

  app.register(cookie)
  app.register(jwt, {
    secret: opts.jwtSecret,
    cookie: { cookieName: SESSION_COOKIE, signed: false },
  })

  // Log every otherwise-unhandled error and always return a real message to the client.
  app.setErrorHandler((err: FastifyError, request, reply) => {
    const status = err.statusCode && err.statusCode >= 400 ? err.statusCode : 500
    if (status >= 500) request.log.error({ err }, 'unhandled error')
    else request.log.warn({ err }, 'request error')
    reply.code(status).send({ error: describeError(err) })
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
