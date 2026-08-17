import { describe, expect, it } from 'vitest'
import { ParameterStore } from './params'

const defs = [
  { id: 'mouthOpen', min: 0, max: 1, default: 0 },
  { id: 'headYaw', min: -1, max: 1, default: 0 },
]

describe('ParameterStore', () => {
  it('starts every parameter at its default', () => {
    const store = new ParameterStore(defs)
    expect(store.get('mouthOpen')).toBe(0)
    expect(store.get('headYaw')).toBe(0)
  })

  it('clamps values into the declared range', () => {
    const store = new ParameterStore(defs)
    store.set('mouthOpen', 1.5)
    expect(store.get('mouthOpen')).toBe(1)
    store.set('headYaw', -3)
    expect(store.get('headYaw')).toBe(-1)
  })

  it('rejects unknown parameters and non-finite values', () => {
    const store = new ParameterStore(defs)
    expect(() => store.set('nope', 0)).toThrow(/unknown/i)
    expect(() => store.get('nope')).toThrow(/unknown/i)
    expect(() => store.set('mouthOpen', Number.NaN)).toThrow(/finite/i)
  })

  it('rejects duplicate ids and inconsistent ranges', () => {
    expect(() => new ParameterStore([defs[0], defs[0]])).toThrow(/duplicate/i)
    expect(() => new ParameterStore([{ id: 'x', min: 1, max: 0, default: 0 }])).toThrow()
    expect(() => new ParameterStore([{ id: 'x', min: 0, max: 1, default: 2 }])).toThrow()
  })

  it('returns a detached snapshot of all values', () => {
    const store = new ParameterStore(defs)
    const snapshot = store.values()
    expect(snapshot).toEqual({ mouthOpen: 0, headYaw: 0 })
    snapshot.mouthOpen = 9
    expect(store.get('mouthOpen')).toBe(0)
  })
})
