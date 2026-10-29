import { describe, expect, it } from 'vitest'

import type { MotionClip, MotionLayer } from './motion.js'
import { MotionMixer, MotionPlayer, validateMotionClip } from './motion.js'

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

  it('keeps velocity continuous through catmull-rom control points', () => {
    const mixer = new MotionMixer([{ clip: {
      id: 'continuous-sway',
      durationMs: 4000,
      loop: true,
      tracks: [{
        target: { kind: 'root', property: 'translateX' },
        interpolation: 'catmull-rom',
        keyframes: [
          { timeMs: 0, value: 1 },
          { timeMs: 1000, value: 0 },
          { timeMs: 2000, value: -1 },
          { timeMs: 3000, value: 0 },
          { timeMs: 4000, value: 1 },
        ],
      }],
    } }])

    expect(mixer.sample(1000).root.translateX).toBe(0)
    expect(
      Math.abs(mixer.sample(1001).root.translateX - mixer.sample(999).root.translateX),
    ).toBeGreaterThan(0.001)
  })

  it('accounts for uneven keyframe timing in catmull-rom velocity', () => {
    const mixer = new MotionMixer([{ clip: {
      id: 'uneven-sway',
      durationMs: 4000,
      tracks: [{
        target: { kind: 'root', property: 'translateX' },
        interpolation: 'catmull-rom',
        keyframes: [
          { timeMs: 0, value: 0 },
          { timeMs: 700, value: 10 },
          { timeMs: 2300, value: -5 },
          { timeMs: 4000, value: 0 },
        ],
      }],
    } }])
    const epsilonMs = 0.01
    const leftVelocity = (mixer.sample(700).root.translateX -
      mixer.sample(700 - epsilonMs).root.translateX) / epsilonMs
    const rightVelocity = (mixer.sample(700 + epsilonMs).root.translateX -
      mixer.sample(700).root.translateX) / epsilonMs

    expect(leftVelocity).toBeCloseTo(rightVelocity, 5)
  })
})

describe('MotionPlayer', () => {
  const fixedLayer = (id: string, value: number): MotionLayer => ({
    clip: {
      id,
      durationMs: 1000,
      tracks: [{
        target: { kind: 'root', property: 'translateY' },
        keyframes: [{ timeMs: 0, value }],
      }],
    },
  })

  it('crossfades preset changes without a root jump', () => {
    const player = new MotionPlayer([fixedLayer('from', 10)])
    expect(player.sample(1000).root.translateY).toBe(10)

    player.transitionTo([fixedLayer('to', 30)], 1000, 400)
    expect(player.sample(1000).root.translateY).toBe(10)
    expect(player.sample(1200).root.translateY).toBe(20)
    expect(player.sample(1400).root.translateY).toBe(30)
  })

  it('starts an interrupted transition from the visible frame', () => {
    const player = new MotionPlayer([fixedLayer('one', 0)])
    player.sample(0)
    player.transitionTo([fixedLayer('two', 20)], 0, 400)
    const visible = player.sample(100).root.translateY
    player.transitionTo([fixedLayer('three', -20)], 100, 400)

    expect(player.sample(100).root.translateY).toBeCloseTo(visible)
  })

  it('validates transition timing', () => {
    const player = new MotionPlayer([fixedLayer('idle', 0)])
    expect(() => player.transitionTo([], 0, -1)).toThrow(/durationMs/)
  })
})
