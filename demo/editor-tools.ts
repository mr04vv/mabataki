export interface SelectionRect {
  x1: number
  y1: number
  x2: number
  y2: number
}

export function verticesInRect(positions: ArrayLike<number>, rect: SelectionRect): number[] {
  const minX = Math.min(rect.x1, rect.x2)
  const maxX = Math.max(rect.x1, rect.x2)
  const minY = Math.min(rect.y1, rect.y2)
  const maxY = Math.max(rect.y1, rect.y2)
  const selected: number[] = []
  for (let vertex = 0; vertex < positions.length / 2; vertex++) {
    const x = positions[vertex * 2]
    const y = positions[vertex * 2 + 1]
    if (x >= minX && x <= maxX && y >= minY && y <= maxY) selected.push(vertex)
  }
  return selected
}

export function softSelectionWeights(
  positions: ArrayLike<number>,
  selectedVertices: ReadonlySet<number>,
  radius: number,
  enabled: boolean,
  pinnedVertices: ReadonlySet<number> = new Set(),
): Float32Array {
  const weights = new Float32Array(positions.length / 2)
  if (selectedVertices.size === 0) return weights
  for (const vertex of selectedVertices) {
    if (!pinnedVertices.has(vertex)) weights[vertex] = 1
  }
  if (!enabled || radius <= 0) return weights
  for (let vertex = 0; vertex < weights.length; vertex++) {
    if (weights[vertex] === 1) continue
    if (pinnedVertices.has(vertex)) continue
    let nearest = Number.POSITIVE_INFINITY
    for (const selected of selectedVertices) {
      nearest = Math.min(nearest, Math.hypot(
        positions[vertex * 2] - positions[selected * 2],
        positions[vertex * 2 + 1] - positions[selected * 2 + 1],
      ))
    }
    if (nearest < radius) weights[vertex] = 0.5 + 0.5 * Math.cos(Math.PI * nearest / radius)
  }
  return weights
}
