import { describe, expect, it } from 'vitest'

import type { MotionClip } from './motion.js'
import { MotionMixer, validateMotionClip } from './motion.js'

const floatClip: MotionClip = {
  id: 'float',
  durationMs: 1000,
  loop: true,
  tracks: [{
    target: { kind: 'root', property: 'translateY' },
    interpolation: 'linear',
    keyframes: [
      { timeMs: 0, value: 0 },
      { timeMs: 500, value: -20 },
      { timeMs: 1000, value: 0 },
    ],
  }],
}

describe('MotionMixer', () => {
  it('samples and loops renderer-independent root motion', () => {
    const mixer = new MotionMixer([{ clip: floatClip }])

    expect(mixer.sample(0).root.translateY).toBe(0)
    expect(mixer.sample(250).root.translateY).toBe(-10)
    expect(mixer.sample(500).root.translateY).toBe(-20)
    expect(mixer.sample(1250).root.translateY).toBe(-10)
  })

  it('smoothsteps between keyframes when requested', () => {
    const clip: MotionClip = {
      ...floatClip,
      loop: false,
      tracks: [{
        ...floatClip.tracks[0],
        interpolation: 'smoothstep',
      }],
    }
    const mixer = new MotionMixer([{ clip }])

    expect(mixer.sample(125).root.translateY).toBeCloseTo(-3.125)
  })

  it('keeps parameter motion separate from the root transform', () => {
    const clip: MotionClip = {
      id: 'blink',
      durationMs: 200,
      tracks: [{
        target: { kind: 'parameter', id: 'eyeOpenLeft' },
        keyframes: [
          { timeMs: 0, value: 1 },
          { timeMs: 100, value: 0 },
          { timeMs: 200, value: 1 },
        ],
      }],
    }
    const frame = new MotionMixer([{ clip }]).sample(100, { mouthOpen: 0.8 })

    expect(frame.parameters).toEqual({ mouthOpen: 0.8, eyeOpenLeft: 0 })
    expect(frame.root).toEqual({
      translateX: 0,
      translateY: 0,
      rotation: 0,
      scaleX: 1,
      scaleY: 1,
    })
  })

  it('mixes additive idle offsets over live input', () => {
    const clip: MotionClip = {
      id: 'head-idle',
      durationMs: 1000,
      tracks: [{
        target: { kind: 'parameter', id: 'headYaw' },
        keyframes: [{ timeMs: 0, value: 0.1 }],
      }],
    }
    const mixer = new MotionMixer([{ clip, blend: 'additive', weight: 0.5 }])

    expect(mixer.sample(0, { headYaw: -0.4 }).parameters.headYaw).toBeCloseTo(-0.35)
  })

  it('treats additive scale values as offsets from identity', () => {
    const clip: MotionClip = {
      id: 'breathe',
      durationMs: 1000,
      tracks: [{
        target: { kind: 'root', property: 'scaleY' },
        keyframes: [{ timeMs: 0, value: 0.02 }],
      }],
    }

    expect(new MotionMixer([{ clip, blend: 'additive' }]).sample(0).root.scaleY)
      .toBeCloseTo(1.02)
  })

  it('supports speed, offset, and partial override weight', () => {
    const mixer = new MotionMixer([{
      clip: floatClip,
      speed: 2,
      offsetMs: 125,
      weight: 0.5,
    }])

    expect(mixer.sample(0).root.translateY).toBe(-2.5)
    expect(mixer.sample(125).root.translateY).toBe(-7.5)
  })

  it('clamps non-looping clips at their ends', () => {
    const clip = { ...floatClip, loop: false }
    const mixer = new MotionMixer([{ clip }])

    expect(mixer.sample(-100).root.translateY).toBe(0)
    expect(mixer.sample(1200).root.translateY).toBe(0)
  })

  it('rejects malformed clips and layer controls', () => {
    expect(() => validateMotionClip('float')).toThrow(/object/)
    expect(() => validateMotionClip({ ...floatClip, durationMs: 0 })).toThrow(/durationMs/)
    expect(() => validateMotionClip({
      ...floatClip,
      tracks: [{
        ...floatClip.tracks[0],
        keyframes: [
          { timeMs: 500, value: 0 },
          { timeMs: 100, value: 1 },
        ],
      }],
    })).toThrow(/sorted/)
    expect(() => new MotionMixer([{ clip: floatClip, weight: 2 }])).toThrow(/weight/)
    expect(() => new MotionMixer([{ clip: floatClip, speed: -1 }])).toThrow(/speed/)
    expect(() => new MotionMixer([{
      clip: floatClip,
      blend: 'multiply' as 'override',
    }])).toThrow(/blend/)
    expect(() => new MotionMixer([{ clip: floatClip }]).sample(Number.NaN)).toThrow(/elapsedMs/)
  })
})
