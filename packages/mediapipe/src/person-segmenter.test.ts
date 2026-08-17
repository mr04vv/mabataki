import { describe, expect, it } from 'vitest'
import { confidenceToAlpha } from './person-segmenter'

describe('confidenceToAlpha', () => {
  it('keeps confident person pixels and removes low-confidence background', () => {
    expect(confidenceToAlpha(0)).toBe(0)
    expect(confidenceToAlpha(0.2)).toBe(0)
    expect(confidenceToAlpha(0.5)).toBeCloseTo(128, 0)
    expect(confidenceToAlpha(0.8)).toBe(255)
    expect(confidenceToAlpha(1)).toBe(255)
  })

  it('rejects non-finite values', () => {
    expect(confidenceToAlpha(Number.NaN)).toBe(0)
  })
})
