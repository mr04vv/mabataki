import { describe, expect, it } from 'vitest'

import { audioLevelToMouthOpen, smoothMouthOpen } from './audio-lip-sync.js'

describe('audioLevelToMouthOpen', () => {
  it('ignores the noise floor and clamps loud input', () => {
    expect(audioLevelToMouthOpen(0.01)).toBe(0)
    expect(audioLevelToMouthOpen(0.5)).toBe(1)
    expect(audioLevelToMouthOpen(Number.NaN)).toBe(0)
  })

  it('responds to quiet speech', () => {
    expect(audioLevelToMouthOpen(0.03)).toBeGreaterThan(0.3)
  })
})

describe('smoothMouthOpen', () => {
  it('opens faster than it closes', () => {
    const opened = smoothMouthOpen(0, 1, 16)
    const remainingAfterClose = smoothMouthOpen(1, 0, 16)

    expect(opened).toBeGreaterThan(1 - remainingAfterClose)
  })

  it('does not move when no time elapsed', () => {
    expect(smoothMouthOpen(0.4, 1, 0)).toBe(0.4)
  })
})
