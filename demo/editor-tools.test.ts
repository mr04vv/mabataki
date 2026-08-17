import { describe, expect, it } from 'vitest'
import { softSelectionWeights, verticesInRect } from './editor-tools'

describe('verticesInRect', () => {
  it('selects vertices regardless of drag direction', () => {
    const positions = [0, 0, 10, 10, 20, 20]
    expect(verticesInRect(positions, { x1: 15, y1: 15, x2: 5, y2: 5 })).toEqual([1])
  })
})

describe('softSelectionWeights', () => {
  it('moves only selected vertices when disabled', () => {
    expect([...softSelectionWeights([0, 0, 10, 0], new Set([0]), 20, false)]).toEqual([1, 0])
  })

  it('falls off smoothly to zero at the radius', () => {
    const weights = softSelectionWeights([0, 0, 5, 0, 10, 0], new Set([0]), 10, true)
    expect(weights[0]).toBe(1)
    expect(weights[1]).toBeCloseTo(0.5)
    expect(weights[2]).toBe(0)
  })

  it('uses the nearest selected vertex', () => {
    const weights = softSelectionWeights([0, 0, 10, 0, 20, 0], new Set([0, 2]), 15, true)
    expect(weights[1]).toBeGreaterThan(0)
  })

  it('keeps pinned vertices at zero weight', () => {
    const weights = softSelectionWeights([0, 0, 5, 0], new Set([0]), 10, true, new Set([1]))
    expect([...weights]).toEqual([1, 0])
  })
})
