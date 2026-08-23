import { describe, expect, it } from 'vitest'

import { ParameterComposer } from './parameter-composer.js'

const definitions = [
  { id: 'mouthOpen', min: 0, max: 1, default: 0 },
  { id: 'headYaw', min: -1, max: 1, default: 0 },
]

describe('ParameterComposer', () => {
  it('combines owned override and additive sources in order', () => {
    const composer = new ParameterComposer(definitions)
    const values = composer.compose([
      {
        id: 'tracker',
        values: { mouthOpen: 0.9, headYaw: 0.4 },
        include: ['headYaw'],
      },
      {
        id: 'voice',
        values: { mouthOpen: 0.8 },
        include: ['mouthOpen'],
      },
      {
        id: 'idle',
        values: { headYaw: -0.2 },
        blend: 'additive',
        weight: 0.5,
      },
    ])

    expect(values.mouthOpen).toBe(0.8)
    expect(values.headYaw).toBeCloseTo(0.3)
  })

  it('starts with defaults, accepts a base, ignores unknown ids, and clamps', () => {
    const composer = new ParameterComposer(definitions)
    const values = composer.compose([
      { values: { unknown: 100, mouthOpen: 2 } },
    ], { headYaw: -0.5 })

    expect(values).toEqual({ mouthOpen: 1, headYaw: -0.5 })
  })

  it('rejects malformed layers', () => {
    const composer = new ParameterComposer(definitions)

    expect(() => composer.compose([{ values: { mouthOpen: Number.NaN } }])).toThrow(/finite/)
    expect(() => composer.compose([{ values: {}, weight: 2 }])).toThrow(/weight/)
  })
})
