import { describe, expect, it } from 'vitest'
import { parseCredentials } from '../src/auth/validation'

describe('parseCredentials', () => {
  it('accepts valid credentials and normalizes the email', () => {
    const result = parseCredentials({ email: '  USER@Example.COM ', password: 'longenough' })
    expect(result).toEqual({
      ok: true,
      data: { email: 'user@example.com', password: 'longenough' },
    })
  })

  it('rejects an invalid email', () => {
    const result = parseCredentials({ email: 'nope', password: 'longenough' })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toMatch(/valid email/i)
  })

  it('rejects a short password', () => {
    const result = parseCredentials({ email: 'user@example.com', password: 'short' })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toMatch(/at least 8/i)
  })

  it('rejects a non-object body', () => {
    expect(parseCredentials(null).ok).toBe(false)
    expect(parseCredentials('string').ok).toBe(false)
  })
})
