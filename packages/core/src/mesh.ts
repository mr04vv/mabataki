import type { MeshData } from './model.js'

/**
 * Creates a regular grid mesh covering a width x height rectangle,
 * with `cols` x `rows` cells (2 triangles each). Vertices are row-major,
 * positions in pixel space, uvs in 0..1.
 */
export function createGridMesh(width: number, height: number, cols: number, rows: number): MeshData {
  return createGridMeshRegion(width, height, 0, 0, width, height, cols, rows)
}

/**
 * Creates a grid over one pixel-space region of a larger texture. UVs still
 * address the full texture, allowing transparent padding to stay outside the
 * editable mesh.
 */
export function createGridMeshRegion(
  textureWidth: number,
  textureHeight: number,
  regionX: number,
  regionY: number,
  width: number,
  height: number,
  cols: number,
  rows: number,
): MeshData {
  if (!(textureWidth > 0) || !(textureHeight > 0) || !(width > 0) || !(height > 0)) {
    throw new Error('grid and texture sizes must be positive')
  }
  if (![textureWidth, textureHeight, regionX, regionY, width, height].every(Number.isFinite)) {
    throw new Error('grid region must contain finite numbers')
  }
  if (
    regionX < 0 ||
    regionY < 0 ||
    regionX + width > textureWidth ||
    regionY + height > textureHeight
  ) {
    throw new Error('grid region must stay inside the texture')
  }
  if (!Number.isInteger(cols) || !Number.isInteger(rows) || cols < 1 || rows < 1) {
    throw new Error('grid subdivisions must be positive integers')
  }

  const vertices: number[] = []
  const uvs: number[] = []
  for (let y = 0; y <= rows; y++) {
    for (let column = 0; column <= cols; column++) {
      const vertexX = regionX + (column / cols) * width
      const vertexY = regionY + (y / rows) * height
      vertices.push(vertexX, vertexY)
      uvs.push(vertexX / textureWidth, vertexY / textureHeight)
    }
  }

  const indices: number[] = []
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const topLeft = y * (cols + 1) + x
      const topRight = topLeft + 1
      const bottomLeft = topLeft + cols + 1
      const bottomRight = bottomLeft + 1
      indices.push(topLeft, topRight, bottomLeft, topRight, bottomRight, bottomLeft)
    }
  }

  return { vertices, uvs, indices }
}
