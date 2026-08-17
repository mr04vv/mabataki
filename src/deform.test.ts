import { describe, expect, it } from 'vitest'
import { accumulateBinding, applyDeformations } from './deform'
import type { Binding } from './model'

const twoKeys = [
  { value: 0, deltas: [0, 0] },
  { value: 1, deltas: [10, -20] },
]

describe('accumulateBinding', () => {
  it('interpolates linearly between two keyframes', () => {
    const out = new Float32Array(2)
    accumulateBinding(twoKeys, 0.5, out)
    expect([...out]).toEqual([5, -10])
  })

  it('clamps below the first and above the last keyframe', () => {
    const low = new Float32Array(2)
    accumulateBinding(twoKeys, -1, low)
    expect([...low]).toEqual([0, 0])

    const high = new Float32Array(2)
    accumulateBinding(twoKeys, 2, high)
    expect([...high]).toEqual([10, -20])
  })

  it('interpolates piecewise across 3 keyframes (yaw-style -1/0/+1)', () => {
    const threeKeys = [
      { value: -1, deltas: [-10, 0] },
      { value: 0, deltas: [0, 0] },
      { value: 1, deltas: [10, 0] },
    ]
    const out = new Float32Array(2)
    accumulateBinding(threeKeys, -0.5, out)
    expect([...out]).toEqual([-5, 0])

    out.fill(0)
    accumulateBinding(threeKeys, 0.25, out)
    expect([...out]).toEqual([2.5, 0])
  })

  it('accumulates into the existing output values', () => {
    const out = new Float32Array([1, 1])
    accumulateBinding(twoKeys, 1, out)
    expect([...out]).toEqual([11, -19])
  })

  it('does nothing for an empty keyframe list', () => {
    const out = new Float32Array([3, 4])
    accumulateBinding([], 0.5, out)
    expect([...out]).toEqual([3, 4])
  })
})

describe('applyDeformations', () => {
  const bindings: Binding[] = [
    {
      parameterId: 'a',
      keyframes: [
        { value: 0, deltas: [0, 0] },
        { value: 1, deltas: [10, 0] },
      ],
    },
    {
      parameterId: 'b',
      keyframes: [
        { value: 0, deltas: [0, 0] },
        { value: 1, deltas: [0, 4] },
      ],
    },
  ]

  it('adds each binding contribution to the base vertices', () => {
    const result = applyDeformations([100, 200], bindings, { a: 0.5, b: 1 })
    expect([...result]).toEqual([105, 204])
  })

  it('reuses the provided output buffer', () => {
    const out = new Float32Array(2)
    const result = applyDeformations([1, 2], bindings, { a: 0, b: 0 }, out)
    expect(result).toBe(out)
    expect([...result]).toEqual([1, 2])
  })

  it('throws when a bound parameter value is missing', () => {
    expect(() => applyDeformations([0, 0], bindings, { a: 1 })).toThrow(/parameter/)
  })

  it('throws when the output buffer length does not match', () => {
    expect(() => applyDeformations([0, 0], bindings, { a: 0, b: 0 }, new Float32Array(4))).toThrow()
  })
})
