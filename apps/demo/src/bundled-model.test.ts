import { describe, expect, it } from 'vitest'
import modelData from '../public/models/mouth/model.json'
import characterData from '../public/models/character/model.json'
import { MabatakiRuntime, validateModel } from '@mabataki/core'

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

describe('bundled character model', () => {
  it('has four ordered parts driven by three headYaw key poses', () => {
    const model = validateModel(characterData)
    expect(model.parts.map((part) => part.id)).toEqual(['face', 'eyes', 'glasses', 'mouth'])
    for (const part of model.parts) {
      const binding = part.bindings.find((candidate) => candidate.parameterId === 'headYaw')
      expect(binding?.keyframes.map((keyframe) => keyframe.value)).toEqual([-1, 0, 1])
    }
  })

  it('keeps glasses independent from blink while following head pose', () => {
    const model = validateModel(characterData)
    const glasses = model.parts.find((part) => part.id === 'glasses')
    expect(glasses?.texture).toBe('glasses.svg')
    expect(glasses?.mesh.vertices).toHaveLength(8)
    expect(glasses?.bindings.map((binding) => binding.parameterId)).toEqual([
      'headYaw',
      'headRoll',
    ])

    const runtime = new MabatakiRuntime(model)
    const base = [...runtime.getPartVertices('glasses')]
    runtime.update({ eyeOpenLeft: 0, eyeOpenRight: 0 })
    expect([...runtime.getPartVertices('glasses')]).toEqual(base)

    runtime.update({ headYaw: 1 })
    expect([...runtime.getPartVertices('glasses')]).not.toEqual(base)
  })

  it('drives every part with three headRoll key poses', () => {
    const model = validateModel(characterData)
    expect(model.parameters.find((parameter) => parameter.id === 'headRoll')).toEqual({
      id: 'headRoll',
      min: -1,
      max: 1,
      default: 0,
    })
    for (const part of model.parts) {
      const binding = part.bindings.find((candidate) => candidate.parameterId === 'headRoll')
      expect(binding?.keyframes.map((keyframe) => keyframe.value)).toEqual([-1, 0, 1])
    }
  })

  it('uses independent left and right blink bindings on a localized eye mesh', () => {
    const model = validateModel(characterData)
    const eyes = model.parts.find((part) => part.id === 'eyes')
    expect(model.parameters.filter((parameter) => parameter.id.startsWith('eyeOpen'))).toEqual([
      { id: 'eyeOpenLeft', min: 0, max: 1, default: 1 },
      { id: 'eyeOpenRight', min: 0, max: 1, default: 1 },
    ])
    const xs = eyes?.mesh.vertices.filter((_, index) => index % 2 === 0) ?? []
    const ys = eyes?.mesh.vertices.filter((_, index) => index % 2 === 1) ?? []
    expect(xs).toHaveLength(91)
    expect([Math.min(...xs), Math.max(...xs)]).toEqual([194, 324])
    expect([Math.min(...ys), Math.max(...ys)]).toEqual([38, 117])

    const runtime = new MabatakiRuntime(model)
    runtime.update({ eyeOpenLeft: 0 })
    const positions = runtime.getPartVertices('eyes')
    let leftMoved = false
    for (let index = 0; index < (eyes?.mesh.vertices.length ?? 0); index += 2) {
      const x = eyes?.mesh.vertices[index] ?? 0
      const changed = Math.abs(
        positions[index + 1] - (eyes?.mesh.vertices[index + 1] ?? 0),
      ) > 0.0001
      if (x < 255) leftMoved ||= changed
      if (x > 270) expect(changed).toBe(false)
    }
    expect(leftMoved).toBe(true)

    const leftBinding = eyes?.bindings.find(
      (binding) => binding.parameterId === 'eyeOpenLeft',
    )
    const closed = leftBinding?.keyframes.find((keyframe) => keyframe.value === 0)
    const centerColumn = xs.findIndex((x) => Math.abs(x - 221.5) < 6)
    const columnCount = 13
    const top = centerColumn * 2
    const lidBoundary = (2 * columnCount + centerColumn) * 2
    const bottom = (6 * columnCount + centerColumn) * 2
    expect(closed?.deltas[top + 1]).toBeCloseTo(0)
    expect(closed?.deltas[lidBoundary + 1]).toBeGreaterThan(35)
    expect(closed?.deltas[bottom + 1]).toBeCloseTo(0)
  })

  it('deforms every part when headYaw changes', () => {
    const model = validateModel(characterData)
    const runtime = new MabatakiRuntime(model)
    runtime.update({ headYaw: 1 })
    for (const part of model.parts) {
      expect([...runtime.getPartVertices(part.id)]).not.toEqual(part.mesh.vertices)
    }
  })

  it('tilts every part while keeping the lower body and tail fixed', () => {
    const model = validateModel(characterData)
    const runtime = new MabatakiRuntime(model)
    runtime.update({ headRoll: 1 })
    for (const part of model.parts) {
      expect([...runtime.getPartVertices(part.id)]).not.toEqual(part.mesh.vertices)
      const binding = part.bindings.find((candidate) => candidate.parameterId === 'headRoll')
      const rightPose = binding?.keyframes.find((keyframe) => keyframe.value === 1)
      for (let index = 0; index < part.mesh.vertices.length; index += 2) {
        const x = part.mesh.vertices[index]
        const y = part.mesh.vertices[index + 1]
        if (y >= 332.5 || (part.id === 'face' && x <= 100)) {
          expect(rightPose?.deltas[index]).toBeCloseTo(0)
          expect(rightPose?.deltas[index + 1]).toBeCloseTo(0)
        }
      }
    }
  })

  it('starts body roll gradually above the lower-body pivot', () => {
    const model = validateModel(characterData)
    const face = model.parts.find((part) => part.id === 'face')
    const rightPose = face?.bindings
      .find((binding) => binding.parameterId === 'headRoll')
      ?.keyframes.find((keyframe) => keyframe.value === 1)
    expect(face).toBeDefined()
    expect(rightPose).toBeDefined()

    let upperWaistMoved = false
    for (let index = 0; index < (face?.mesh.vertices.length ?? 0); index += 2) {
      const x = face?.mesh.vertices[index] ?? 0
      const y = face?.mesh.vertices[index + 1] ?? 0
      const movement = Math.hypot(
        rightPose?.deltas[index] ?? 0,
        rightPose?.deltas[index + 1] ?? 0,
      )
      if (y === 285 && Math.abs(x - 259) < 10) upperWaistMoved ||= movement > 4
      if (y === 332.5) expect(movement).toBeCloseTo(0)
    }
    expect(upperWaistMoved).toBe(true)
  })

  it('uses an expressive ten-degree head and body roll pose', () => {
    const model = validateModel(characterData)
    const eyes = model.parts.find((part) => part.id === 'eyes')
    const rightPose = eyes?.bindings
      .find((binding) => binding.parameterId === 'headRoll')
      ?.keyframes.find((keyframe) => keyframe.value === 1)
    const centerTop = eyes?.mesh.vertices.findIndex((value, index, vertices) =>
      index % 2 === 0 && value === 259 && vertices[index + 1] === 38,
    ) ?? -1
    expect(centerTop).toBeGreaterThanOrEqual(0)
    expect(rightPose?.deltas[centerTop]).toBeGreaterThan(50)
  })

  it('keeps the lower body pinned during headYaw', () => {
    const model = validateModel(characterData)
    for (const part of model.parts) {
      const binding = part.bindings.find((candidate) => candidate.parameterId === 'headYaw')
      const rightPose = binding?.keyframes.find((keyframe) => keyframe.value === 1)
      expect(rightPose).toBeDefined()
      for (let index = 0; index < part.mesh.vertices.length; index += 2) {
        if (part.mesh.vertices[index + 1] < 330) continue
        expect(rightPose?.deltas[index]).toBe(0)
        expect(rightPose?.deltas[index + 1]).toBe(0)
      }
    }
  })

  it('anchors the outer face edges while headYaw moves its center', () => {
    const model = validateModel(characterData)
    const face = model.parts.find((part) => part.id === 'face')
    const binding = face?.bindings.find((candidate) => candidate.parameterId === 'headYaw')
    const rightPose = binding?.keyframes.find((keyframe) => keyframe.value === 1)
    expect(face).toBeDefined()
    expect(rightPose).toBeDefined()

    let centerMoved = false
    for (let index = 0; index < (face?.mesh.vertices.length ?? 0); index += 2) {
      const x = face?.mesh.vertices[index] ?? 0
      const y = face?.mesh.vertices[index + 1] ?? 0
      if ((x === 0 || x === 403) && y <= 190) {
        expect(rightPose?.deltas[index]).toBeCloseTo(0)
      }
      if (Math.abs(x - 259) < 10 && y <= 190) {
        centerMoved ||= (rightPose?.deltas[index] ?? 0) > 10
      }
    }
    expect(centerMoved).toBe(true)
  })

  it('limits the mouth mesh to the visible mouth region', () => {
    const model = validateModel(characterData)
    const mouth = model.parts.find((part) => part.id === 'mouth')
    expect(mouth).toBeDefined()

    const xs = mouth?.mesh.vertices.filter((_, index) => index % 2 === 0) ?? []
    const ys = mouth?.mesh.vertices.filter((_, index) => index % 2 === 1) ?? []
    expect(xs).toHaveLength(45)
    expect(Math.min(...xs)).toBe(180)
    expect(Math.max(...xs)).toBe(337)
    expect(Math.min(...ys)).toBe(105)
    expect(Math.max(...ys)).toBe(163)
  })

  it('opens the lower mouth most strongly at the artwork center', () => {
    const model = validateModel(characterData)
    const mouth = model.parts.find((part) => part.id === 'mouth')
    const binding = mouth?.bindings.find(
      (candidate) => candidate.parameterId === 'mouthOpen',
    )
    const openPose = binding?.keyframes.find((keyframe) => keyframe.value === 1)
    expect(mouth).toBeDefined()
    expect(openPose).toBeDefined()

    let strongestIndex = 0
    for (let index = 2; index < (openPose?.deltas.length ?? 0); index += 2) {
      if ((openPose?.deltas[index + 1] ?? 0) > (openPose?.deltas[strongestIndex + 1] ?? 0)) {
        strongestIndex = index
      }
    }

    expect(mouth?.mesh.vertices[strongestIndex]).toBe(258.5)
    expect(mouth?.mesh.vertices[strongestIndex + 1]).toBe(163)
    expect(openPose?.deltas[strongestIndex + 1]).toBe(24)
  })
})
