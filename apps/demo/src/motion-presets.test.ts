import { MotionMixer } from '@mabataki/core'
import { describe, expect, it } from 'vitest'

import { MOTION_PRESETS, MOTION_PRESET_IDS } from './motion-presets.js'

describe('motion presets', () => {
  it.each(MOTION_PRESET_IDS)('%s stays finite over repeated loops', (id) => {
    const mixer = new MotionMixer(MOTION_PRESETS[id].layers)
    for (let elapsedMs = 0; elapsedMs < 30_000; elapsedMs += 137) {
      const frame = mixer.sample(elapsedMs, {
        headYaw: 0,
        headRoll: 0,
        eyeOpenLeft: 1,
        eyeOpenRight: 1,
      })
      expect(Object.values(frame.parameters).every(Number.isFinite)).toBe(true)
      expect(Object.values(frame.root).every(Number.isFinite)).toBe(true)
      expect(frame.root.scaleX).toBeGreaterThan(0)
      expect(frame.root.scaleY).toBeGreaterThan(0)
    }
  })

  it('keeps grounded characters anchored', () => {
    const mixer = new MotionMixer(MOTION_PRESETS.grounded.layers)

    expect(mixer.sample(2300).root).toEqual({
      translateX: 0,
      translateY: 0,
      rotation: 0,
      scaleX: 1,
      scaleY: 1,
    })
  })

  it('moves balloon and lively characters through different root paths', () => {
    const balloon = new MotionMixer(MOTION_PRESETS.balloon.layers).sample(1625).root
    const lively = new MotionMixer(MOTION_PRESETS.lively.layers).sample(450).root

    expect(balloon.translateY).toBe(-26)
    expect(balloon.rotation).toBeGreaterThan(0)
    expect(balloon.rotation).toBeLessThan(0.022)
    expect(lively.translateY).toBeCloseTo(-8)
    expect(lively.scaleY).toBeCloseTo(1.008)
  })
})
