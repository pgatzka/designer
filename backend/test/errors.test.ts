import { describe, expect, it } from 'vitest'
import { describeError } from '../src/errors'

describe('describeError', () => {
  it('returns the message of a plain Error', () => {
    expect(describeError(new Error('boom'))).toBe('boom')
  })

  it('appends an error code when present (e.g. ECONNREFUSED)', () => {
    const err = Object.assign(new Error('connect ECONNREFUSED 127.0.0.1:5432'), {
      code: 'ECONNREFUSED',
    })
    expect(describeError(err)).toBe('connect ECONNREFUSED 127.0.0.1:5432 (ECONNREFUSED)')
  })

  it('unwraps an AggregateError whose own message is empty (the silent-import case)', () => {
    const agg = new AggregateError(
      [
        Object.assign(new Error('connect ECONNREFUSED ::1:5432'), { code: 'ECONNREFUSED' }),
        Object.assign(new Error('connect ECONNREFUSED 127.0.0.1:5432'), { code: 'ECONNREFUSED' }),
      ],
      '',
    )
    const msg = describeError(agg)
    expect(msg).not.toBe('')
    expect(msg).toContain('ECONNREFUSED')
    expect(msg).toContain(';')
  })

  it('prefers an AggregateError message when it has one', () => {
    const agg = new AggregateError([new Error('inner')], 'all connections failed')
    expect(describeError(agg)).toBe('all connections failed')
  })

  it('handles non-Error values and nullish input', () => {
    expect(describeError('plain string')).toBe('plain string')
    expect(describeError(null)).toBe('unknown error')
  })
})
