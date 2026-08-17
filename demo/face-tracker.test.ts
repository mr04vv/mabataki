import { describe, expect, it } from 'vitest'
import type { FaceLandmarkerResult } from '@mediapipe/tasks-vision'
import {
  calibrateJawOpen,
  calibrateEyeOpen,
  estimateHeadRoll,
  estimateHeadYaw,
  faceValuesFromResult,
} from './face-tracker'

describe('estimateHeadYaw', () => {
  it('normalizes the nose offset within the face width', () => {
    const landmarks = Array.from({ length: 455 }, () => ({ x: 0, y: 0, z: 0, visibility: 1 }))
    landmarks[234].x = 0.3
    landmarks[454].x = 0.7
    landmarks[1].x = 0.54
    const result = { faceLandmarks: [landmarks] } as FaceLandmarkerResult
    expect(estimateHeadYaw(result)).toBeLessThan(-0.5)
  })

  it('returns zero when no face landmarks are available', () => {
    expect(estimateHeadYaw({ faceLandmarks: [] } as unknown as FaceLandmarkerResult)).toBe(0)
  })
})

describe('estimateHeadRoll', () => {
  it('normalizes the face-edge angle and mirrors its direction', () => {
    const landmarks = Array.from({ length: 455 }, () => ({ x: 0, y: 0, z: 0, visibility: 1 }))
    landmarks[234] = { x: 0.3, y: 0.4, z: 0, visibility: 1 }
    landmarks[454] = { x: 0.7, y: 0.5, z: 0, visibility: 1 }
    const result = { faceLandmarks: [landmarks] } as FaceLandmarkerResult
    expect(estimateHeadRoll(result)).toBeLessThan(-0.5)
  })

  it('suppresses small tilts and missing landmarks', () => {
    const landmarks = Array.from({ length: 455 }, () => ({ x: 0, y: 0, z: 0, visibility: 1 }))
    landmarks[234] = { x: 0.3, y: 0.4, z: 0, visibility: 1 }
    landmarks[454] = { x: 0.7, y: 0.405, z: 0, visibility: 1 }
    expect(estimateHeadRoll({ faceLandmarks: [landmarks] } as FaceLandmarkerResult)).toBe(0)
    expect(estimateHeadRoll({ faceLandmarks: [] } as unknown as FaceLandmarkerResult)).toBe(0)
  })
})

describe('calibrateJawOpen', () => {
  it('ignores closed-mouth noise and reaches full scale early', () => {
    expect(calibrateJawOpen(0.03)).toBe(0)
    expect(calibrateJawOpen(0.55)).toBe(1)
    expect(calibrateJawOpen(0.9)).toBe(1)
  })

  it('boosts typical speaking values', () => {
    expect(calibrateJawOpen(0.25)).toBeGreaterThan(0.5)
  })
})

describe('calibrateEyeOpen', () => {
  it('maps open-eye noise to one and a blink to zero', () => {
    expect(calibrateEyeOpen(0.05)).toBe(1)
    expect(calibrateEyeOpen(0.65)).toBe(0)
    expect(calibrateEyeOpen(1)).toBe(0)
  })
})

describe('faceValuesFromResult', () => {
  it('maps MediaPipe blendshapes to runtime parameters', () => {
    const result = {
      faceBlendshapes: [{
        categories: [
          { categoryName: 'jawOpen', score: 0.8 },
          { categoryName: 'mouthSmileLeft', score: 0.4 },
          { categoryName: 'mouthSmileRight', score: 0.6 },
          { categoryName: 'eyeBlinkLeft', score: 0.8 },
          { categoryName: 'eyeBlinkRight', score: 0.2 },
        ],
      }],
    } as FaceLandmarkerResult

    expect(faceValuesFromResult(result)).toEqual({
      headYaw: 0,
      headRoll: 0,
      eyeOpenLeft: calibrateEyeOpen(0.2),
      eyeOpenRight: calibrateEyeOpen(0.8),
      mouthOpen: 1,
      mouthSmileLeft: 0.4,
      mouthSmileRight: 0.6,
    })
    const values = faceValuesFromResult(result)
    expect(values?.eyeOpenLeft).toBeGreaterThan(values?.eyeOpenRight ?? 1)
  })

  it('returns null when no face was detected', () => {
    expect(faceValuesFromResult({ faceBlendshapes: [] } as unknown as FaceLandmarkerResult)).toBeNull()
  })
})
