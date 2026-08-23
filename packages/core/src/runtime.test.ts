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

  it('returns parameter snapshots and resets parameters', () => {
    const runtime = new MabatakiRuntime(makeModel())
    runtime.update({ mouthOpen: 1 })
    const snapshot = runtime.getParameters()
    snapshot.mouthOpen = 0

    expect(runtime.getParameter('mouthOpen')).toBe(1)
    runtime.reset()
    expect(runtime.getParameter('mouthOpen')).toBe(0.25)
  })

  it('can reset spring velocity without resetting parameters', () => {
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
    runtime.step(16)
    runtime.resetPhysics()

    expect(runtime.getParameter('mouthOpen')).toBe(1)
    expect(runtime.getPartVertices('mouth')[0]).toBeCloseTo(18)
  })

  it('resolves parameter-driven local part poses with hierarchy metadata', () => {
    const model = makeModel()
    model.parts.push({
      id: 'hand',
      texture: 'hand.png',
      parentId: 'mouth',
      maskId: 'mouth',
      transform: { x: 20, y: 10 },
      mesh: { vertices: [0, 0], uvs: [0, 0], indices: [] },
      bindings: [],
      transformBindings: [{
        parameterId: 'mouthOpen',
        keyframes: [
          { value: 0, transform: {} },
          { value: 1, transform: { x: 12, rotation: 0.2 } },
        ],
      }],
    })
    const runtime = new MabatakiRuntime(model)
    runtime.update({ mouthOpen: 0.5 })

    expect(runtime.getPartPose('hand')).toMatchObject({
      parentId: 'mouth',
      maskId: 'mouth',
      transform: { x: 26, y: 10, rotation: 0.1 },
    })
  })

  it('lets an attached part lag behind root motion and settle', () => {
    const model = makeModel()
    model.parts.push({
      id: 'hair',
      texture: 'hair.png',
      parentId: 'mouth',
      mesh: { vertices: [0, 0], uvs: [0, 0], indices: [] },
      bindings: [],
      transformSpringBindings: [{
        source: { kind: 'root', property: 'translateY' },
        property: 'y',
        frequencyHz: 3,
        dampingRatio: 0.8,
        scale: 1,
      }],
    })
    const runtime = new MabatakiRuntime(model)
    runtime.step(0, { translateY: 20 })
    expect(runtime.getPartTransform('hair').y).toBe(-20)

    for (let frame = 0; frame < 120; frame++) runtime.step(1000 / 60)
    expect(runtime.getPartTransform('hair').y).toBeCloseTo(0, 3)
    expect(() => runtime.step(16, { translateY: Number.NaN })).toThrow(/root motion/)
  })

  it('lets a child lag behind a parameter-driven parent transform', () => {
    const model = makeModel()
    model.parts[0].transformBindings = [{
      parameterId: 'mouthOpen',
      keyframes: [
        { value: 0, transform: {} },
        { value: 1, transform: { x: 10 } },
      ],
    }]
    model.parts.push({
      id: 'child',
      texture: 'child.png',
      parentId: 'mouth',
      mesh: { vertices: [0, 0], uvs: [0, 0], indices: [] },
      bindings: [],
      transformSpringBindings: [{
        source: { kind: 'parent', property: 'x' },
        property: 'x',
        frequencyHz: 3,
        dampingRatio: 0.8,
        scale: 1,
      }],
    })
    const runtime = new MabatakiRuntime(model)
    runtime.update({ mouthOpen: 1 })

    expect(runtime.getPartTransform('child').x).toBe(-7.5)
    runtime.resetPhysics()
    expect(runtime.getPartTransform('child').x).toBe(0)
  })
})
