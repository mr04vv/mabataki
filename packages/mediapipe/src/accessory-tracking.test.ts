import { describe, expect, it } from 'vitest'
import type { NormalizedLandmark } from '@mediapipe/tasks-vision'
import { estimateEyeAccessoryAnchor } from './accessory-tracking'

function landmarks(): NormalizedLandmark[] {
  return Array.from({ length: 264 }, () => ({ x: 0, y: 0, z: 0, visibility: 1 }))
}

describe('estimateEyeAccessoryAnchor', () => {
  it('uses the mirrored eye midpoint, span, and angle', () => {
    const points = landmarks()
    points[33] = { x: 0.2, y: 0.3, z: 0, visibility: 1 }
    points[263] = { x: 0.6, y: 0.5, z: 0, visibility: 1 }

    const anchor = estimateEyeAccessoryAnchor(points)
    expect(anchor?.x).toBeCloseTo(0.6)
    expect(anchor?.y).toBeCloseTo(0.4)
    expect(anchor?.eyeSpan).toBeCloseTo(Math.hypot(0.4, 0.2))
    expect(anchor?.rotation).toBeCloseTo(-Math.atan2(0.2, 0.4))
  })

  it('rejects missing and coincident eye landmarks', () => {
    expect(estimateEyeAccessoryAnchor([])).toBeNull()
    expect(estimateEyeAccessoryAnchor(landmarks())).toBeNull()
  })
})
