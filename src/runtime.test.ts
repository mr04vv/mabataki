import { describe, expect, it } from 'vitest'
import { applyDeformations } from './deform'
import type { MabatakiModel } from './model'
import { MabatakiRuntime } from './runtime'

function makeModel(): MabatakiModel {
  return {
    version: 1,
    parameters: [{ id: 'mouthOpen', min: 0, max: 1, default: 0.25 }],
    parts: [{
      id: 'mouth',
      texture: 'mouth.png',
      mesh: { vertices: [10, 20], uvs: [0, 0], indices: [] },
      bindings: [{
        parameterId: 'mouthOpen',
        keyframes: [
          { value: 0, deltas: [0, 0] },
          { value: 1, deltas: [8, 4] },
        ],
      }],
    }],
  }
}

describe('MabatakiRuntime', () => {
  it('applies parameter defaults initially', () => {
    expect([...new MabatakiRuntime(makeModel()).getPartVertices('mouth')]).toEqual([12, 21])
  })

  it('matches direct deformation after an update', () => {
    const model = makeModel()
    const runtime = new MabatakiRuntime(model)
    runtime.update({ mouthOpen: 0.5 })
    const expected = applyDeformations(model.parts[0].mesh.vertices, model.parts[0].bindings, {
      mouthOpen: 0.5,
    })
    expect(runtime.getPartVertices('mouth')).toEqual(expected)
  })

  it('ignores unknown parameters while applying known ones', () => {
    const runtime = new MabatakiRuntime(makeModel())
    runtime.update({ headYaw: 1, mouthOpen: 0.75 })
    expect(runtime.getParameter('mouthOpen')).toBe(0.75)
  })

  it('clamps values and rejects non-finite values', () => {
    const runtime = new MabatakiRuntime(makeModel())
    runtime.update({ mouthOpen: 2 })
    expect(runtime.getParameter('mouthOpen')).toBe(1)
    expect(() => runtime.update({ mouthOpen: Number.NaN })).toThrow()
  })

  it('throws for unknown parameters and parts when reading', () => {
    const runtime = new MabatakiRuntime(makeModel())
    expect(() => runtime.getParameter('nope')).toThrow()
    expect(() => runtime.getPartVertices('nope')).toThrow()
  })

  it('reuses its vertex buffer between reads and updates', () => {
    const runtime = new MabatakiRuntime(makeModel())
    const first = runtime.getPartVertices('mouth')
    expect(runtime.getPartVertices('mouth')).toBe(first)
    runtime.update({ mouthOpen: 1 })
    expect(runtime.getPartVertices('mouth')).toBe(first)
    expect([...first]).toEqual([18, 24])
  })

  it('lags weighted vertices and settles toward the parameter target', () => {
    const model = makeModel()
    model.parts[0].springBindings = [{
      parameterId: 'mouthOpen',
      frequencyHz: 3,
      dampingRatio: 0.8,
      scaleX: 10,
      scaleY: 0,
      weights: [1],
    }]
    const runtime = new MabatakiRuntime(model)
    runtime.update({ mouthOpen: 1 })
    expect(runtime.getPartVertices('mouth')[0]).toBeCloseTo(10.5)

    for (let frame = 0; frame < 120; frame++) runtime.step(1000 / 60)
    expect(runtime.getPartVertices('mouth')[0]).toBeCloseTo(18, 3)
  })

  it('validates spring time steps', () => {
    const runtime = new MabatakiRuntime(makeModel())
    expect(() => runtime.step(-1)).toThrow(/deltaMs/)
    expect(() => runtime.step(Number.NaN)).toThrow(/deltaMs/)
  })
})
