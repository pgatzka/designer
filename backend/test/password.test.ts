import { describe, expect, it } from 'vitest'
import { hashPassword, verifyPassword } from '../src/auth/password'

describe('password', () => {
  it('hashes and verifies a correct password', async () => {
    const hash = await hashPassword('correct horse battery staple')
    expect(hash).not.toBe('correct horse battery staple')
    expect(await verifyPassword(hash, 'correct horse battery staple')).toBe(true)
  })

  it('rejects an incorrect password', async () => {
    const hash = await hashPassword('s3cret-password')
    expect(await verifyPassword(hash, 'wrong-password')).toBe(false)
  })

  it('returns false for a malformed hash instead of throwing', async () => {
    expect(await verifyPassword('not-a-real-hash', 'whatever')).toBe(false)
  })
})
