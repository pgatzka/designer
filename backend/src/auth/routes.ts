import type { FastifyInstance, FastifyReply } from 'fastify'
import { AuthService, EmailTakenError, InvalidCredentialsError } from './service'
import { parseCredentials } from './validation'
import type { User } from './types'

export const SESSION_COOKIE = 'session'
const SESSION_MAX_AGE = 60 * 60 * 24 * 7 // 7 days, in seconds

interface SessionPayload {
  sub: string
  email: string
}

/** Register email/password auth routes under /api/auth. */
export function registerAuthRoutes(app: FastifyInstance, authService: AuthService): void {
  const secure = process.env.NODE_ENV === 'production'

  async function startSession(reply: FastifyReply, user: User): Promise<void> {
    const token = await reply.jwtSign(
      { sub: user.id, email: user.email } satisfies SessionPayload,
      { expiresIn: '7d' },
    )
    reply.setCookie(SESSION_COOKIE, token, {
      httpOnly: true,
      sameSite: 'lax',
      secure,
      path: '/',
      maxAge: SESSION_MAX_AGE,
    })
  }

  app.post('/api/auth/register', async (request, reply) => {
    const parsed = parseCredentials(request.body)
    if (!parsed.ok) return reply.code(400).send({ error: parsed.error })
    try {
      const user = await authService.register(parsed.data.email, parsed.data.password)
      await startSession(reply, user)
      request.log.info({ userId: user.id }, 'user registered')
      return reply.code(201).send({ user })
    } catch (err) {
      if (err instanceof EmailTakenError) {
        request.log.warn({ email: parsed.data.email }, 'registration rejected: email taken')
        return reply.code(409).send({ error: err.message })
      }
      throw err
    }
  })

  app.post('/api/auth/login', async (request, reply) => {
    const parsed = parseCredentials(request.body)
    if (!parsed.ok) return reply.code(400).send({ error: parsed.error })
    try {
      const user = await authService.login(parsed.data.email, parsed.data.password)
      await startSession(reply, user)
      request.log.info({ userId: user.id }, 'user logged in')
      return reply.send({ user })
    } catch (err) {
      if (err instanceof InvalidCredentialsError) {
        request.log.warn({ email: parsed.data.email }, 'login rejected: invalid credentials')
        return reply.code(401).send({ error: err.message })
      }
      throw err
    }
  })

  app.post('/api/auth/logout', async (_request, reply) => {
    reply.clearCookie(SESSION_COOKIE, { path: '/' })
    return reply.code(204).send()
  })

  app.get('/api/auth/me', async (request, reply) => {
    try {
      await request.jwtVerify()
    } catch {
      return reply.code(401).send({ error: 'Not authenticated' })
    }
    const payload = request.user as SessionPayload
    return reply.send({ user: { id: payload.sub, email: payload.email } })
  })
}
