import { describe, expect, it } from 'vitest'
import type { FaceTrackingFrame, NormalizedLandmark } from '@mabataki/mediapipe'
import { faceFilterTrackingTarget } from './filter-tracking'

function trackingFrame(landmarks: NormalizedLandmark[]): FaceTrackingFrame {
  return {
    parameters: {
      headYaw: 0.2,
      headRoll: 0.1,
      eyeOpenLeft: 1,
      eyeOpenRight: 1,
      mouthOpen: 0.4,
      mouthSmileLeft: 0,
      mouthSmileRight: 0,
    },
    viewTransform: { x: 0.6, y: 0.55, faceWidth: 0.32, rotation: 0.1, scale: 1 },
    landmarks,
    facePose: { matrix: Array(16).fill(0), yaw: 0.3, pitch: -0.2, roll: 0.15 },
  }
}

describe('faceFilterTrackingTarget', () => {
  it('anchors eye accessories to the projected eye line', () => {
    const landmarks = Array.from(
      { length: 264 },
      () => ({ x: 0, y: 0, z: 0, visibility: 1 }),
    )
    landmarks[33] = { x: 0.2, y: 0.3, z: 0, visibility: 1 }
    landmarks[263] = { x: 0.6, y: 0.4, z: 0, visibility: 1 }

    const target = faceFilterTrackingTarget(trackingFrame(landmarks), 'eyes')

    expect(target.x).toBeCloseTo(0.6)
    expect(target.y).toBeCloseTo(0.35)
    expect(target.faceWidth).toBeCloseTo(0.32)
    expect(target.roll).toBeCloseTo(-Math.atan2(0.1, 0.4))
    expect(target.yaw).toBeCloseTo(0.3)
    expect(target.pitch).toBeCloseTo(-0.2)
  })

  it('keeps full masks on the whole-face anchor', () => {
    const target = faceFilterTrackingTarget(trackingFrame([]), 'face')

    expect(target.x).toBeCloseTo(0.6)
    expect(target.y).toBeCloseTo(0.55)
    expect(target.roll).toBeCloseTo(0.15)
  })

  it('falls back to the face anchor when eye landmarks are unavailable', () => {
    const target = faceFilterTrackingTarget(trackingFrame([]), 'eyes')

    expect(target.x).toBeCloseTo(0.6)
    expect(target.y).toBeCloseTo(0.55)
  })
})
