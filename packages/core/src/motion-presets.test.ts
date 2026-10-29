import { describe, expect, it } from 'vitest'

import { MotionMixer } from './motion.js'
import {
  createFloatingMotion,
  createGroundedMotion,
  createLivelyMotion,
} from './motion-presets.js'
import type { FloatingMotionStyle } from './motion-presets.js'

describe('motion preset factories', () => {
  it('configures horizontal and vertical floating distance independently', () => {
    const mixer = new MotionMixer(createFloatingMotion({
      amplitudeX: 12,
      amplitudeY: 30,
      periodMs: 4000,
      periodXMs: 4000,
      periodYMs: 4000,
    }))

    const right = mixer.sample(0).root
    const top = mixer.sample(1000).root
    const left = mixer.sample(2000).root
    const bottom = mixer.sample(3000).root
    expect(right.translateX).toBe(12)
    expect(right.translateY).toBe(0)
    expect(top.translateX).toBe(0)
    expect(top.translateY).toBeCloseTo(-30)
    expect(left.translateX).toBe(-12)
    expect(left.translateY).toBe(0)
    expect(bottom.translateX).toBe(0)
    expect(bottom.translateY).toBeCloseTo(19.5)
  })

  it('runs floating axes on independent periods', () => {
    const mixer = new MotionMixer(createFloatingMotion({
      amplitudeX: 10,
      amplitudeY: 20,
      periodXMs: 4000,
      periodYMs: 2000,
    }))

    const frame = mixer.sample(500).root
    expect(frame.translateX).toBeCloseTo(6.25)
    expect(frame.translateY).toBeCloseTo(-20)
  })

  it('provides distinct named floating styles', () => {
    const hover = new MotionMixer(createFloatingMotion({ style: 'hover' })).sample(0).root
    const balloon = new MotionMixer(createFloatingMotion({ style: 'balloon' })).sample(0).root
    const ghostLayers = createFloatingMotion({ style: 'ghost' })

    expect(hover.translateX).toBe(4)
    expect(balloon.translateX).toBe(14)
    expect(ghostLayers[0]?.offsetMs).toBe(430)
    expect(ghostLayers.map((layer) => layer.clip.id)).toContain('ghost-vertical')
  })

  it('allows numeric options to override a named style', () => {
    const mixer = new MotionMixer(createFloatingMotion({
      style: 'balloon',
      amplitudeY: 40,
      periodYMs: 4000,
    }))

    expect(mixer.sample(1000).root.translateY).toBeCloseTo(-40)
  })

  it('generates long deterministic variation before repeating', () => {
    const first = createFloatingMotion({ style: 'balloon', seed: 42 })
    const same = createFloatingMotion({ style: 'balloon', seed: 42 })
    const different = createFloatingMotion({ style: 'balloon', seed: 43 })
    const horizontal = first.find((layer) => layer.clip.id === 'balloon-horizontal')

    expect(first).toEqual(same)
    expect(first).not.toEqual(different)
    expect(horizontal?.clip.durationMs).toBeGreaterThan(9800 * 3.5)
    expect(horizontal?.clip.tracks[0].keyframes).toHaveLength(17)
  })

  it('keeps grounded motion at the root identity', () => {
    const frame = new MotionMixer(createGroundedMotion()).sample(1700)

    expect(frame.root).toEqual({
      translateX: 0,
      translateY: 0,
      rotation: 0,
      scaleX: 1,
      scaleY: 1,
    })
  })

  it('configures lively bounce and squash', () => {
    const mixer = new MotionMixer(createLivelyMotion({
      amplitudeX: 5,
      amplitudeY: 20,
      squash: 0.02,
      periodMs: 2000,
    }))
    const right = mixer.sample(0).root
    const top = mixer.sample(500).root

    expect(right.translateX).toBe(5)
    expect(top.translateX).toBe(0)
    expect(top.translateY).toBe(-20)
    expect(top.scaleY).toBeCloseTo(1.0134)
  })

  it('applies playback controls to every generated layer', () => {
    const layers = createFloatingMotion({ weight: 0.4, speed: 1.5, offsetMs: 200 })

    expect(layers.every((layer) => layer.weight === 0.4)).toBe(true)
    expect(layers.every((layer) => layer.speed === 1.5)).toBe(true)
    expect(layers.every((layer) => layer.offsetMs === 200)).toBe(true)
  })

  it('rejects invalid settings before playback', () => {
    expect(() => createFloatingMotion({ amplitudeY: -1 })).toThrow(/amplitudeY/)
    expect(() => createFloatingMotion({ periodMs: 0 })).toThrow(/periodMs/)
    expect(() => createFloatingMotion({ periodXMs: 0 })).toThrow(/periodXMs/)
    expect(() => createFloatingMotion({ variation: 0.6 })).toThrow(/variation/)
    expect(() => createFloatingMotion({ cycleCount: 2.5 })).toThrow(/cycleCount/)
    expect(() => createFloatingMotion({
      style: 'cloud' as FloatingMotionStyle,
    })).toThrow(/style/)
    expect(() => createGroundedMotion({ weight: 2 })).toThrow(/weight/)
    expect(() => createLivelyMotion({ blinkIntervalMs: 200 })).toThrow(/blinkIntervalMs/)
  })
})
