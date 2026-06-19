import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { buildApp } from '../src/app'
import type { Database } from '../src/designs/types'
import { FakeDesignRepository, FakeUserRepository } from './fakeRepo'

const CREDS = { email: 'owner@example.com', password: 'longenough' }

const DB: Database = {
  schemas: [
    {
      name: 'public',
      tables: [
        {
          name: 'user',
          columns: [{ name: 'id', type: 'integer', nullable: false }],
          constraints: [{ name: 'pk', type: 'primary-key', columns: ['id'] }],
          foreignKeys: [],
        },
      ],
    },
  ],
}

describe('design routes', () => {
  let app: FastifyInstance

  beforeEach(() => {
    app = buildApp({
      jwtSecret: 'test-secret-test-secret',
      userRepository: new FakeUserRepository(),
      designRepository: new FakeDesignRepository(),
    })
  })

  afterEach(async () => {
    await app.close()
  })

  async function authedCookie(): Promise<string> {
    const res = await app.inject({ method: 'POST', url: '/api/auth/register', payload: CREDS })
    const c = res.cookies.find((x) => x.name === 'session')!
    return `session=${c.value}`
  }

  it('requires authentication', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/designs' })
    expect(res.statusCode).toBe(401)
  })

  it('creates, lists, fetches, updates and deletes a design', async () => {
    const cookie = await authedCookie()

    const created = await app.inject({
      method: 'POST',
      url: '/api/designs',
      headers: { cookie },
      payload: { name: 'My design', flavor: 'mysql', database: DB },
    })
    expect(created.statusCode).toBe(201)
    const id = created.json().design.id
    expect(created.json().design.database.schemas[0].tables[0].name).toBe('user')
    expect(created.json().design.flavor).toBe('mysql')

    const list = await app.inject({ method: 'GET', url: '/api/designs', headers: { cookie } })
    expect(list.json().designs).toHaveLength(1)
    expect(list.json().designs[0]).toMatchObject({ id, name: 'My design', flavor: 'mysql' })

    const fetched = await app.inject({
      method: 'GET',
      url: `/api/designs/${id}`,
      headers: { cookie },
    })
    expect(fetched.statusCode).toBe(200)
    expect(fetched.json().design.database).toEqual(DB)

    const updated = await app.inject({
      method: 'PUT',
      url: `/api/designs/${id}`,
      headers: { cookie },
      payload: { name: 'Renamed' },
    })
    expect(updated.statusCode).toBe(200)
    expect(updated.json().design.name).toBe('Renamed')
    // Flavor is immutable: it survives a name update (and there is no way to set it).
    expect(updated.json().design.flavor).toBe('mysql')

    const del = await app.inject({
      method: 'DELETE',
      url: `/api/designs/${id}`,
      headers: { cookie },
    })
    expect(del.statusCode).toBe(204)

    const after = await app.inject({ method: 'GET', url: '/api/designs', headers: { cookie } })
    expect(after.json().designs).toHaveLength(0)
  })

  it('validates the create payload', async () => {
    const cookie = await authedCookie()
    const res = await app.inject({
      method: 'POST',
      url: '/api/designs',
      headers: { cookie },
      payload: { name: '', flavor: 'postgres', database: DB },
    })
    expect(res.statusCode).toBe(400)
  })

  it('rejects an unknown flavor with 400', async () => {
    const cookie = await authedCookie()
    const res = await app.inject({
      method: 'POST',
      url: '/api/designs',
      headers: { cookie },
      payload: { name: 'x', flavor: 'sqlite', database: DB },
    })
    expect(res.statusCode).toBe(400)
  })

  it('rejects a create payload missing the flavor with 400', async () => {
    const cookie = await authedCookie()
    const res = await app.inject({
      method: 'POST',
      url: '/api/designs',
      headers: { cookie },
      payload: { name: 'x', database: DB },
    })
    expect(res.statusCode).toBe(400)
  })

  it('404s for another user’s design and for unknown ids', async () => {
    const cookie = await authedCookie()
    const missing = await app.inject({
      method: 'GET',
      url: '/api/designs/does-not-exist',
      headers: { cookie },
    })
    expect(missing.statusCode).toBe(404)
  })

  it('rejects an empty update payload with 400', async () => {
    const cookie = await authedCookie()
    const res = await app.inject({
      method: 'PUT',
      url: '/api/designs/whatever',
      headers: { cookie },
      payload: {},
    })
    expect(res.statusCode).toBe(400)
  })

  it('404s when updating or deleting an unknown design', async () => {
    const cookie = await authedCookie()
    const upd = await app.inject({
      method: 'PUT',
      url: '/api/designs/does-not-exist',
      headers: { cookie },
      payload: { name: 'x' },
    })
    expect(upd.statusCode).toBe(404)

    const del = await app.inject({
      method: 'DELETE',
      url: '/api/designs/does-not-exist',
      headers: { cookie },
    })
    expect(del.statusCode).toBe(404)
  })
})
