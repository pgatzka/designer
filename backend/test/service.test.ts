import { beforeEach, describe, expect, it } from 'vitest'
import { AuthService, EmailTakenError, InvalidCredentialsError } from '../src/auth/service'
import { FakeUserRepository } from './fakeRepo'

describe('AuthService', () => {
  let service: AuthService

  beforeEach(() => {
    service = new AuthService(new FakeUserRepository())
  })

  it('registers a new user and returns a public user (no hash)', async () => {
    const user = await service.register('user@example.com', 'longenough')
    expect(user.email).toBe('user@example.com')
    expect(user.id).toBeTruthy()
    expect(user).not.toHaveProperty('passwordHash')
  })

  it('rejects registering a duplicate email', async () => {
    await service.register('dup@example.com', 'longenough')
    await expect(service.register('dup@example.com', 'another-one')).rejects.toBeInstanceOf(
      EmailTakenError,
    )
  })

  it('logs in with correct credentials', async () => {
    await service.register('login@example.com', 'longenough')
    const user = await service.login('login@example.com', 'longenough')
    expect(user.email).toBe('login@example.com')
  })

  it('rejects login with a wrong password', async () => {
    await service.register('login@example.com', 'longenough')
    await expect(service.login('login@example.com', 'wrongpass')).rejects.toBeInstanceOf(
      InvalidCredentialsError,
    )
  })

  it('rejects login for an unknown email', async () => {
    await expect(service.login('ghost@example.com', 'longenough')).rejects.toBeInstanceOf(
      InvalidCredentialsError,
    )
  })
})
