import { describe, expect, it } from 'vitest'

import type { Part } from './model.js'
import { resolvePartTransform } from './part-transform.js'

const part: Part = {
  id: 'hand',
  texture: 'hand.png',
  transform: { x: 20, y: 30, pivotX: 4, pivotY: 5 },
  mesh: { vertices: [0, 0], uvs: [0, 0], indices: [] },
  bindings: [],
  transformBindings: [{
    parameterId: 'headYaw',
    keyframes: [
      { value: -1, transform: { x: -10, rotation: -0.2 } },
      { value: 0, transform: {} },
      { value: 1, transform: { x: 14, rotation: 0.3, scaleX: 0.1 } },
    ],
  }],
}

describe('resolvePartTransform', () => {
  it('interpolates rigid key poses relative to the neutral transform', () => {
    expect(resolvePartTransform(part, { headYaw: 0.5 })).toEqual({
      x: 27,
      y: 30,
      rotation: 0.15,
      scaleX: 1.05,
      scaleY: 1,
      pivotX: 4,
      pivotY: 5,
    })
  })

  it('clamps outside the authored keyframe range', () => {
    expect(resolvePartTransform(part, { headYaw: 2 }).x).toBe(34)
  })
})
