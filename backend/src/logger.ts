import pino from 'pino'
import type { Env } from './env'

/**
 * Create the application logger. In non-production we use the `pino-pretty`
 * transport for human-readable output; in production we emit structured JSON.
 * The returned instance satisfies the project's `Logger` interface and is also
 * accepted by Fastify as its `loggerInstance`.
 */
export function createLogger(env?: Pick<Env, 'NODE_ENV' | 'LOG_LEVEL'>): pino.Logger {
  const level = env?.LOG_LEVEL ?? process.env.LOG_LEVEL ?? 'info'
  const isProd = (env?.NODE_ENV ?? process.env.NODE_ENV) === 'production'
  return pino({
    level,
    transport: isProd
      ? undefined
      : {
          target: 'pino-pretty',
          options: { translateTime: 'SYS:standard', ignore: 'pid,hostname' },
        },
  })
}
