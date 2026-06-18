import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { buildApp } from '../src/app'
import { FakeUserRepository } from './fakeRepo'

const CREDS = { email: 'user@example.com', password: 'longenough' }

describe('auth routes', () => {
  let app: FastifyInstance

  beforeEach(() => {
    app = buildApp({
      jwtSecret: 'test-secret-test-secret',
      userRepository: new FakeUserRepository(),
    })
  })

  afterEach(async () => {
    await app.close()
  })

  function cookieFrom(res: { cookies: Array<{ name: string; value: string }> }): string {
    const c = res.cookies.find((x) => x.name === 'session')
    if (!c) throw new Error('no session cookie set')
    return `session=${c.value}`
  }

  it('registers a user, sets a session cookie, and authenticates /me', async () => {
    const register = await app.inject({ method: 'POST', url: '/api/auth/register', payload: CREDS })
    expect(register.statusCode).toBe(201)
    expect(register.json().user.email).toBe(CREDS.email)

    const me = await app.inject({
      method: 'GET',
      url: '/api/auth/me',
      headers: { cookie: cookieFrom(register) },
    })
    expect(me.statusCode).toBe(200)
    expect(me.json().user.email).toBe(CREDS.email)
  })

  it('returns 401 from /me without a session', async () => {
    const me = await app.inject({ method: 'GET', url: '/api/auth/me' })
    expect(me.statusCode).toBe(401)
  })

  it('rejects duplicate registration with 409', async () => {
    await app.inject({ method: 'POST', url: '/api/auth/register', payload: CREDS })
    const dup = await app.inject({ method: 'POST', url: '/api/auth/register', payload: CREDS })
    expect(dup.statusCode).toBe(409)
  })

  it('validates input with 400', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: { email: 'bad', password: 'x' },
    })
    expect(res.statusCode).toBe(400)
  })

  it('logs in with correct credentials and 401 on wrong password', async () => {
    await app.inject({ method: 'POST', url: '/api/auth/register', payload: CREDS })

    const ok = await app.inject({ method: 'POST', url: '/api/auth/login', payload: CREDS })
    expect(ok.statusCode).toBe(200)

    const bad = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { ...CREDS, password: 'wrongpass' },
    })
    expect(bad.statusCode).toBe(401)
  })

  it('clears the cookie on logout', async () => {
    const res = await app.inject({ method: 'POST', url: '/api/auth/logout' })
    expect(res.statusCode).toBe(204)
    const cleared = res.cookies.find((c) => c.name === 'session')
    expect(cleared?.value).toBe('')
  })
})
