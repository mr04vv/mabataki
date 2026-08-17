import { describe, expect, it } from 'vitest'
import { createGridMesh, createGridMeshRegion } from './mesh'

describe('createGridMesh', () => {
  it('creates (cols+1)*(rows+1) vertices with matching uvs', () => {
    const mesh = createGridMesh(200, 100, 4, 2)
    expect(mesh.vertices).toHaveLength(15 * 2)
    expect(mesh.uvs).toHaveLength(15 * 2)
  })

  it('creates 2 triangles per cell', () => {
    const mesh = createGridMesh(200, 100, 4, 2)
    expect(mesh.indices).toHaveLength(4 * 2 * 6)
  })

  it('spans the full size with uvs in 0..1', () => {
    const mesh = createGridMesh(200, 100, 4, 2)
    expect(mesh.vertices.slice(0, 2)).toEqual([0, 0])
    expect(mesh.vertices.slice(-2)).toEqual([200, 100])
    expect(mesh.uvs.slice(0, 2)).toEqual([0, 0])
    expect(mesh.uvs.slice(-2)).toEqual([1, 1])
    // vertex at row 1, col 2 (row-major index 7)
    expect(mesh.vertices.slice(14, 16)).toEqual([100, 50])
    expect(mesh.uvs.slice(14, 16)).toEqual([0.5, 0.5])
  })

  it('references only valid vertices', () => {
    const mesh = createGridMesh(10, 10, 3, 3)
    expect(Math.max(...mesh.indices)).toBe(15)
    expect(Math.min(...mesh.indices)).toBe(0)
  })

  it('rejects non-positive sizes and non-integer subdivisions', () => {
    expect(() => createGridMesh(0, 100, 4, 2)).toThrow()
    expect(() => createGridMesh(100, -1, 4, 2)).toThrow()
    expect(() => createGridMesh(100, 100, 0, 2)).toThrow()
    expect(() => createGridMesh(100, 100, 1.5, 2)).toThrow()
  })
})

describe('createGridMeshRegion', () => {
  it('places vertices in a subregion while mapping uvs to the full texture', () => {
    const mesh = createGridMeshRegion(400, 200, 100, 50, 200, 100, 2, 1)
    expect(mesh.vertices.slice(0, 2)).toEqual([100, 50])
    expect(mesh.vertices.slice(-2)).toEqual([300, 150])
    expect(mesh.uvs.slice(0, 2)).toEqual([0.25, 0.25])
    expect(mesh.uvs.slice(-2)).toEqual([0.75, 0.75])
    expect(mesh.indices).toHaveLength(12)
  })

  it('rejects regions outside the texture', () => {
    expect(() => createGridMeshRegion(100, 100, -1, 0, 50, 50, 2, 2)).toThrow()
    expect(() => createGridMeshRegion(100, 100, 60, 0, 50, 50, 2, 2)).toThrow()
    expect(() => createGridMeshRegion(100, 100, 0, 80, 50, 30, 2, 2)).toThrow()
  })
})
