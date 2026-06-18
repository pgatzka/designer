import { buildApp } from './app'
import { createPool } from './db/pool'
import { migrate } from './db/migrate'
import { PgUserRepository } from './db/userRepository'
import { PgDesignRepository } from './db/designRepository'
import { loadEnv } from './env'
import { registerStatic } from './static'

async function main(): Promise<void> {
  const env = loadEnv()
  const pool = createPool(env.DATABASE_URL)
  await migrate(pool)

  const app = buildApp({
    jwtSecret: env.JWT_SECRET,
    userRepository: new PgUserRepository(pool),
    designRepository: new PgDesignRepository(pool),
    logger: true,
  })
  registerStatic(app)

  await app.listen({ port: env.PORT, host: '0.0.0.0' })
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
