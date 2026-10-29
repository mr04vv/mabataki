import { describe, expect, it } from 'vitest'
import modelData from '../public/models/mouth/model.json'
import characterData from '../public/models/character/model.json'
import { MabatakiRuntime, validateModel } from '@mabataki/core'
import type { Binding, Part } from '@mabataki/core'

describe('bundled mouth model', () => {
  it('is valid and deforms downward when mouthOpen is one', () => {
    const model = validateModel(modelData)
    const runtime = new MabatakiRuntime(model)
    runtime.update({ mouthOpen: 1 })
    const vertices = runtime.getPartVertices('mouth')
    expect(vertices.some((value, index) =>
      index % 2 === 1 && value > model.parts[0].mesh.vertices[index],
    )).toBe(true)
  })
})

function binding(part: Part, parameterId: string): Binding {
  const result = part.bindings.find((candidate) => candidate.parameterId === parameterId)
  if (result === undefined) throw new Error(`missing binding "${parameterId}"`)
  return result
}

function affectedVertices(part: Part, parameterId: string): number[] {
  const affected = new Set<number>()
  for (const keyframe of binding(part, parameterId).keyframes) {
    for (let index = 0; index < keyframe.deltas.length; index += 2) {
      if (keyframe.deltas[index] !== 0 || keyframe.deltas[index + 1] !== 0) {
        affected.add(index / 2)
      }
    }
  }
  return [...affected]
}

describe('bundled character model', () => {
  it('loads the single-texture character with the standard parameter contract', () => {
    const model = validateModel(characterData)
    expect(model.parts).toHaveLength(1)
    expect(model.parts[0].id).toBe('face')
    expect(model.parts[0].texture).toBe('man_55.png')
    expect(model.parts[0].mesh.vertices).toHaveLength(1369 * 2)
    expect(model.parts[0].mesh.indices).toHaveLength(2592 * 3)
    expect(model.parameters.map((parameter) => parameter.id)).toEqual([
      'headYaw',
      'headRoll',
      'mouthOpen',
      'eyeOpenLeft',
      'eyeOpenRight',
    ])
  })

  it('defines head, mouth, and independent blink key poses', () => {
    const part = validateModel(characterData).parts[0]
    expect(binding(part, 'headYaw').keyframes.map((keyframe) => keyframe.value)).toEqual([-1, 0, 1])
    expect(binding(part, 'headRoll').keyframes.map((keyframe) => keyframe.value)).toEqual([-1, 0, 1])
    for (const parameterId of ['mouthOpen', 'eyeOpenLeft', 'eyeOpenRight']) {
      expect(binding(part, parameterId).keyframes.map((keyframe) => keyframe.value)).toEqual([0, 1])
    }
  })

  it.each([
    ['headYaw', 1],
    ['headRoll', 1],
    ['mouthOpen', 1],
    ['eyeOpenLeft', 0],
    ['eyeOpenRight', 0],
  ] as const)('deforms the texture for %s', (parameterId, value) => {
    const model = validateModel(characterData)
    const runtime = new MabatakiRuntime(model)
    const base = model.parts[0].mesh.vertices
    runtime.update({ [parameterId]: value })
    const positions = runtime.getPartVertices('face')
    expect(positions.some((position, index) => Math.abs(position - base[index]) > 0.0001)).toBe(true)
  })

  it('keeps mouth and blink edits localized to their feature regions', () => {
    const part = validateModel(characterData).parts[0]
    const mouth = affectedVertices(part, 'mouthOpen')
    const leftEye = affectedVertices(part, 'eyeOpenLeft')
    const rightEye = affectedVertices(part, 'eyeOpenRight')
    const coordinates = (vertices: number[], axis: 0 | 1) =>
      vertices.map((vertex) => part.mesh.vertices[vertex * 2 + axis])

    expect(mouth.length).toBeLessThan(120)
    expect(Math.min(...coordinates(mouth, 1))).toBeGreaterThan(300)
    expect(leftEye.length).toBeLessThan(50)
    expect(rightEye.length).toBeLessThan(50)
    expect(Math.max(...coordinates(leftEye, 0))).toBeLessThan(
      Math.min(...coordinates(rightEye, 0)),
    )
  })

  it('pins the bottom edge during head movement', () => {
    const part = validateModel(characterData).parts[0]
    for (const parameterId of ['headYaw', 'headRoll']) {
      const pose = binding(part, parameterId).keyframes.find((keyframe) => keyframe.value === 1)
      expect(pose).toBeDefined()
      for (let index = 0; index < part.mesh.vertices.length; index += 2) {
        if (part.mesh.vertices[index + 1] <= 506.7) continue
        expect(pose?.deltas[index]).toBe(0)
        expect(pose?.deltas[index + 1]).toBe(0)
      }
    }
  })

  it('mirrors the authored head yaw poses across the texture', () => {
    const part = validateModel(characterData).parts[0]
    const yaw = binding(part, 'headYaw')
    const negative = yaw.keyframes.find((keyframe) => keyframe.value === -1)
    const positive = yaw.keyframes.find((keyframe) => keyframe.value === 1)
    expect(negative).toBeDefined()
    expect(positive).toBeDefined()

    const columns = new Set(
      part.mesh.vertices.filter((_, index) => index % 2 === 0),
    ).size
    const vertexCount = part.mesh.vertices.length / 2
    expect(vertexCount % columns).toBe(0)
    for (let vertex = 0; vertex < vertexCount; vertex++) {
      const row = Math.floor(vertex / columns)
      const column = vertex % columns
      const mirror = row * columns + columns - 1 - column
      expect(negative?.deltas[vertex * 2]).toBeCloseTo(
        -(positive?.deltas[mirror * 2] ?? Number.NaN),
      )
      expect(negative?.deltas[vertex * 2 + 1]).toBeCloseTo(
        positive?.deltas[mirror * 2 + 1] ?? Number.NaN,
      )
    }
  })
})
