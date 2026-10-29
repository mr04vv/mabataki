import { describe, expect, it } from 'vitest'
import {
  createAccessoryMeshGrid,
  projectEyeAccessoryMesh,
  resolveEyeAccessoryPlacement,
} from './camera-placement'

describe('resolveEyeAccessoryPlacement', () => {
  it('derives horizontal placement from the tracked eye anchor', () => {
    const placement = resolveEyeAccessoryPlacement(
      { x: 0.62, y: 0.4, eyeSpan: 0.2, rotation: 0 },
      { offsetY: -10, scale: 1 },
      1000,
      500,
      100,
    )

    expect(placement.x).toBe(620)
    expect(placement.y).toBe(180)
    expect(placement.scale).toBe(2)
  })

  it('rotates the face-local vertical adjustment with the eye line', () => {
    const placement = resolveEyeAccessoryPlacement(
      { x: 0.5, y: 0.5, eyeSpan: 0.2, rotation: Math.PI / 2 },
      { offsetY: 10, scale: 1.25 },
      1000,
      600,
      100,
    )

    expect(placement.x).toBeCloseTo(480)
    expect(placement.y).toBeCloseTo(300)
    expect(placement.scale).toBeCloseTo(2.5)
    expect(placement.rotation).toBeCloseTo(Math.PI / 2)
  })

  it('rejects invalid rendering dimensions', () => {
    expect(() => resolveEyeAccessoryPlacement(
      { x: 0.5, y: 0.5, eyeSpan: 0.2, rotation: 0 },
      { offsetY: 0, scale: 1 },
      0,
      600,
      100,
    )).toThrow(/dimensions/)
  })
})

describe('createAccessoryMeshGrid', () => {
  it('crops transparent texture padding into a regular indexed grid', () => {
    const grid = createAccessoryMeshGrid({
      columns: 3,
      rows: 2,
      left: 20,
      top: 10,
      right: 80,
      bottom: 50,
      pivotX: 50,
      pivotY: 30,
      textureWidth: 100,
      textureHeight: 100,
    })

    expect([...grid.localPoints]).toEqual([
      -30, -20, 0, -20, 30, -20,
      -30, 20, 0, 20, 30, 20,
    ])
    const expectedUvs = [
      0.2, 0.1, 0.5, 0.1, 0.8, 0.1,
      0.2, 0.5, 0.5, 0.5, 0.8, 0.5,
    ]
    grid.uvs.forEach((value, index) => expect(value).toBeCloseTo(expectedUvs[index]))
    expect([...grid.indices]).toEqual([0, 3, 1, 1, 3, 4, 1, 4, 2, 2, 4, 5])
  })
})

describe('projectEyeAccessoryMesh', () => {
  const anchor = { x: 0.5, y: 0.4, eyeSpan: 0.2, rotation: 0 }
  const adjustment = { offsetY: 0, scale: 1 }
  const points = new Float32Array([-50, 0, 0, 0, 50, 0])

  it('matches affine sprite placement while the face is frontal', () => {
    const projected = projectEyeAccessoryMesh(
      anchor,
      adjustment,
      { yaw: 0, pitch: 0 },
      1000,
      500,
      100,
      points,
    )

    expect([...projected]).toEqual([400, 200, 500, 200, 600, 200])
  })

  it('narrows the accessory and makes the near side wider during yaw', () => {
    const projected = projectEyeAccessoryMesh(
      { ...anchor, eyeSpan: anchor.eyeSpan * Math.cos(Math.PI / 4) },
      adjustment,
      { yaw: Math.PI / 4, pitch: 0 },
      1000,
      500,
      100,
      points,
    )
    const leftWidth = projected[2] - projected[0]
    const rightWidth = projected[4] - projected[2]

    expect(projected[0]).toBeGreaterThan(400)
    expect(projected[4]).toBeLessThan(600)
    expect(rightWidth).toBeGreaterThan(leftWidth)
  })

  it('keeps authored offset and roll in face-local coordinates', () => {
    const projected = projectEyeAccessoryMesh(
      { ...anchor, rotation: Math.PI / 2 },
      { offsetY: 10, scale: 1 },
      { yaw: 0, pitch: 0 },
      1000,
      500,
      100,
      new Float32Array([0, 0]),
    )

    expect(projected[0]).toBeCloseTo(480)
    expect(projected[1]).toBeCloseTo(200)
  })
})
