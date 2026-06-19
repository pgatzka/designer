import { buildApp } from './app'
import { createPool } from './db/pool'
import { migrate } from './db/migrate'
import { PgUserRepository } from './db/userRepository'
import { PgDesignRepository } from './db/designRepository'
import { loadEnv } from './env'
import { createLogger } from './logger'
import { registerStatic } from './static'

async function main(): Promise<void> {
  const env = loadEnv()
  const logger = createLogger(env)
  logger.info(
    { nodeEnv: env.NODE_ENV, port: env.PORT, logLevel: env.LOG_LEVEL },
    'starting backend',
  )

  const pool = createPool(env.DATABASE_URL, logger)
  await migrate(pool, logger)

  const app = buildApp({
    jwtSecret: env.JWT_SECRET,
    userRepository: new PgUserRepository(pool),
    designRepository: new PgDesignRepository(pool, logger),
    logger,
  })
  registerStatic(app)

  await app.listen({ port: env.PORT, host: '0.0.0.0' })
  logger.info({ port: env.PORT }, 'backend listening')
}

main().catch((err) => {
  // The logger may not exist yet if env/loadEnv failed; fall back to console.
  createLogger().fatal({ err }, 'backend failed to start')
  process.exit(1)
})
