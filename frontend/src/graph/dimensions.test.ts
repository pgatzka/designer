import { describe, expect, it } from 'vitest'
import { HEADER_HEIGHT, NODE_WIDTH, ROW_HEIGHT, tableHeight } from './dimensions'

describe('dimensions', () => {
  it('exposes stable sizing constants', () => {
    expect(NODE_WIDTH).toBeGreaterThan(0)
    expect(HEADER_HEIGHT).toBeGreaterThan(0)
    expect(ROW_HEIGHT).toBeGreaterThan(0)
  })

  it('computes height from header + rows', () => {
    expect(tableHeight(3)).toBe(HEADER_HEIGHT + 3 * ROW_HEIGHT)
  })

  it('reserves at least one row for empty tables', () => {
    expect(tableHeight(0)).toBe(HEADER_HEIGHT + ROW_HEIGHT)
  })
})
