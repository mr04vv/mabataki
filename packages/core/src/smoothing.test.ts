import { describe, expect, it } from 'vitest'
import { ExponentialSmoother } from './smoothing'

describe('ExponentialSmoother', () => {
  it('snaps to the first target', () => {
    expect(new ExponentialSmoother(80).next(0.75, 16)).toBe(0.75)
  })

  it('converges toward a repeated target', () => {
    const smoother = new ExponentialSmoother(80)
    smoother.next(0, 16)
    const first = smoother.next(1, 16)
    const second = smoother.next(1, 16)
    expect(first).toBeGreaterThan(0)
    expect(second).toBeGreaterThan(first)
    expect(second).toBeLessThan(1)
  })

  it('moves farther when more time has elapsed', () => {
    const fast = new ExponentialSmoother(80)
    const slow = new ExponentialSmoother(80)
    fast.next(0, 0)
    slow.next(0, 0)
    expect(fast.next(1, 32)).toBeGreaterThan(slow.next(1, 8))
  })

  it('resets so the next value snaps again', () => {
    const smoother = new ExponentialSmoother(80)
    smoother.next(0, 16)
    smoother.next(1, 16)
    smoother.reset()
    expect(smoother.next(0.6, 16)).toBe(0.6)
  })

  it('rejects invalid inputs', () => {
    expect(() => new ExponentialSmoother(-1)).toThrow()
    expect(() => new ExponentialSmoother(Number.NaN)).toThrow()
    const smoother = new ExponentialSmoother(80)
    expect(() => smoother.next(Number.POSITIVE_INFINITY, 16)).toThrow()
    expect(() => smoother.next(1, -1)).toThrow()
  })
})
