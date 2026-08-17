import { describe, expect, it } from 'vitest'
import { createGridMesh } from './mesh'
import type { MabatakiModel } from './model'
import { validateModel } from './model'

function makeModel(): MabatakiModel {
  const mesh = createGridMesh(100, 100, 1, 1)
  return {
    version: 1,
    parameters: [{ id: 'mouthOpen', min: 0, max: 1, default: 0 }],
    parts: [
      {
        id: 'mouth',
        texture: 'mouth.png',
        mesh,
        bindings: [
          {
            parameterId: 'mouthOpen',
            keyframes: [
              { value: 0, deltas: new Array<number>(mesh.vertices.length).fill(0) },
              { value: 1, deltas: new Array<number>(mesh.vertices.length).fill(1) },
            ],
          },
        ],
      },
    ],
  }
}

describe('validateModel', () => {
  it('accepts a well-formed model', () => {
    const model = makeModel()
    expect(validateModel(model)).toBe(model)
  })

  it('rejects an unsupported version', () => {
    expect(() => validateModel({ ...makeModel(), version: 2 })).toThrow(/version/)
  })

  it('rejects uv/vertex length mismatches', () => {
    const model = makeModel()
    model.parts[0].mesh.uvs.push(0)
    expect(() => validateModel(model)).toThrow(/uvs/)
  })

  it('rejects out-of-range triangle indices', () => {
    const model = makeModel()
    model.parts[0].mesh.indices[0] = 99
    expect(() => validateModel(model)).toThrow(/indices/)
  })

  it('rejects bindings to undeclared parameters', () => {
    const model = makeModel()
    model.parts[0].bindings[0].parameterId = 'nope'
    expect(() => validateModel(model)).toThrow(/parameter/)
  })

  it('rejects duplicate part ids', () => {
    const model = makeModel()
    model.parts.push(structuredClone(model.parts[0]))
    expect(() => validateModel(model)).toThrow(/duplicate part/)
  })

  it('rejects unsorted keyframes', () => {
    const model = makeModel()
    model.parts[0].bindings[0].keyframes.reverse()
    expect(() => validateModel(model)).toThrow(/ascending/)
  })

  it('rejects delta length mismatches', () => {
    const model = makeModel()
    model.parts[0].bindings[0].keyframes[1].deltas.pop()
    expect(() => validateModel(model)).toThrow(/deltas/)
  })

  it('rejects empty keyframe lists', () => {
    const model = makeModel()
    model.parts[0].bindings[0].keyframes = []
    expect(() => validateModel(model)).toThrow(/keyframes/)
  })

  it('accepts a spring binding with one weight per vertex', () => {
    const model = makeModel()
    model.parts[0].springBindings = [{
      parameterId: 'mouthOpen',
      frequencyHz: 3,
      dampingRatio: 0.6,
      scaleX: 20,
      scaleY: 5,
      weights: new Array<number>(model.parts[0].mesh.vertices.length / 2).fill(1),
    }]
    expect(validateModel(model)).toBe(model)
  })

  it('rejects invalid spring bindings', () => {
    const unknownParameter = makeModel()
    unknownParameter.parts[0].springBindings = [{
      parameterId: 'nope',
      frequencyHz: 3,
      dampingRatio: 0.6,
      scaleX: 20,
      scaleY: 5,
      weights: [1, 1, 1, 1],
    }]
    expect(() => validateModel(unknownParameter)).toThrow(/undeclared parameter/)

    const invalidWeights = makeModel()
    invalidWeights.parts[0].springBindings = [{
      parameterId: 'mouthOpen',
      frequencyHz: 3,
      dampingRatio: 0.6,
      scaleX: 20,
      scaleY: 5,
      weights: [2],
    }]
    expect(() => validateModel(invalidWeights)).toThrow(/weights/)
  })
})
