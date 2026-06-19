import { afterEach, describe, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { buildApp } from '../src/app'
import type { RawSchema, SchemaInspector } from '../src/designs/types'
import { FakeDesignRepository, FakeUserRepository } from './fakeRepo'

const CREDS = { email: 'importer@example.com', password: 'longenough' }

const RAW: RawSchema = {
  columns: [
    {
      schema: 'public',
      table: 'user',
      name: 'id',
      dataType: 'integer',
      nullable: false,
      position: 1,
    },
    {
      schema: 'public',
      table: 'user',
      name: 'email',
      dataType: 'character varying',
      charMaxLength: 255,
      nullable: false,
      position: 2,
    },
  ],
  constraints: [
    { schema: 'public', table: 'user', name: 'pk_user', type: 'primary-key', columns: ['id'] },
  ],
  foreignKeys: [],
}

/** Inspector that returns a canned schema, or throws to simulate a bad connection. */
class FakeInspector implements SchemaInspector {
  constructor(private readonly behavior: RawSchema | Error) {}
  async inspect(): Promise<RawSchema> {
    if (this.behavior instanceof Error) throw this.behavior
    return this.behavior
  }
}

const CONNECTION = {
  host: 'localhost',
  port: 5432,
  database: 'src',
  user: 'reader',
  password: 'secret',
}

function appWith(inspector: SchemaInspector): FastifyInstance {
  return buildApp({
    jwtSecret: 'test-secret-test-secret',
    userRepository: new FakeUserRepository(),
    designRepository: new FakeDesignRepository(),
    schemaInspector: inspector,
  })
}

describe('design import route', () => {
  let app: FastifyInstance

  afterEach(async () => {
    await app.close()
  })

  async function authedCookie(): Promise<string> {
    const res = await app.inject({ method: 'POST', url: '/api/auth/register', payload: CREDS })
    const c = res.cookies.find((x) => x.name === 'session')!
    return `session=${c.value}`
  }

  it('requires authentication', async () => {
    app = appWith(new FakeInspector(RAW))
    const res = await app.inject({
      method: 'POST',
      url: '/api/designs/import',
      payload: { name: 'x', flavor: 'postgres', connection: CONNECTION },
    })
    expect(res.statusCode).toBe(401)
  })

  it('introspects and persists a new design with normalized types', async () => {
    app = appWith(new FakeInspector(RAW))
    const cookie = await authedCookie()
    const res = await app.inject({
      method: 'POST',
      url: '/api/designs/import',
      headers: { cookie },
      payload: { name: 'Imported', flavor: 'postgres', connection: CONNECTION },
    })
    expect(res.statusCode).toBe(201)
    const design = res.json().design
    expect(design).toMatchObject({ name: 'Imported', flavor: 'postgres' })
    const user = design.database.schemas[0].tables[0]
    expect(user.name).toBe('user')
    expect(user.columns).toEqual([
      { name: 'id', type: 'integer', nullable: false },
      { name: 'email', type: 'varchar', length: 255, nullable: false },
    ])
    expect(user.constraints[0]).toMatchObject({ type: 'primary-key', columns: ['id'] })
  })

  it('rejects an invalid payload with 400', async () => {
    app = appWith(new FakeInspector(RAW))
    const cookie = await authedCookie()
    const res = await app.inject({
      method: 'POST',
      url: '/api/designs/import',
      headers: { cookie },
      payload: { name: 'x', flavor: 'postgres' }, // missing connection
    })
    expect(res.statusCode).toBe(400)
  })

  it('returns 400 when the connection/introspection fails', async () => {
    app = appWith(new FakeInspector(new Error('ECONNREFUSED')))
    const cookie = await authedCookie()
    const res = await app.inject({
      method: 'POST',
      url: '/api/designs/import',
      headers: { cookie },
      payload: { name: 'x', flavor: 'postgres', connection: CONNECTION },
    })
    expect(res.statusCode).toBe(400)
    expect(res.json().error).toMatch(/Import failed: ECONNREFUSED/)
  })

  it('surfaces a real message for an AggregateError with an empty message', async () => {
    const agg = new AggregateError(
      [Object.assign(new Error('connect ECONNREFUSED 127.0.0.1:5432'), { code: 'ECONNREFUSED' })],
      '',
    )
    app = appWith(new FakeInspector(agg))
    const cookie = await authedCookie()
    const res = await app.inject({
      method: 'POST',
      url: '/api/designs/import',
      headers: { cookie },
      payload: { name: 'x', flavor: 'postgres', connection: CONNECTION },
    })
    expect(res.statusCode).toBe(400)
    // Previously this produced the unhelpful "Import failed: " with no detail.
    expect(res.json().error).toContain('ECONNREFUSED')
  })
})
