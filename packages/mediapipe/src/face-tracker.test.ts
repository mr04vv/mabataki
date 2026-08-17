import { describe, expect, it } from 'vitest'
import type { FaceLandmarkerResult } from '@mediapipe/tasks-vision'
import {
  calibrateFaceScale,
  calibrateEyeOpen,
  calibrateJawOpen,
  estimateFacePlacement,
  estimateFaceWidth,
  estimateHeadRoll,
  estimateHeadYaw,
  faceTrackingFrameFromResult,
  faceValuesFromResult,
} from './face-tracker'

function landmarksWithFaceWidth(width: number) {
  const landmarks = Array.from({ length: 455 }, () => ({ x: 0, y: 0, z: 0, visibility: 1 }))
  landmarks[234] = { x: 0.5 - width / 2, y: 0.4, z: 0, visibility: 1 }
  landmarks[454] = { x: 0.5 + width / 2, y: 0.4, z: 0, visibility: 1 }
  landmarks[1] = { x: 0.5, y: 0.4, z: 0, visibility: 1 }
  return landmarks
}

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

describe('camera-space scale', () => {
  it('measures face width and normalizes it against a neutral frame', () => {
    const result = {
      faceLandmarks: [landmarksWithFaceWidth(0.4)],
    } as FaceLandmarkerResult
    expect(estimateFaceWidth(result)).toBeCloseTo(0.4)
    expect(calibrateFaceScale(0.4, 0.4)).toBe(1)
    expect(calibrateFaceScale(0.48, 0.4)).toBeCloseTo(1.2)
  })

  it('reports mirrored camera placement independently from runtime parameters', () => {
    const landmarks = landmarksWithFaceWidth(0.4)
    landmarks[234] = { x: 0.2, y: 0.3, z: 0, visibility: 1 }
    landmarks[454] = { x: 0.6, y: 0.5, z: 0, visibility: 1 }
    const placement = estimateFacePlacement({
      faceLandmarks: [landmarks],
    } as FaceLandmarkerResult)

    expect(placement?.x).toBeCloseTo(0.6)
    expect(placement?.y).toBeCloseTo(0.4)
    expect(placement?.faceWidth).toBeCloseTo(Math.hypot(0.4, 0.2))
    expect(placement?.rotation).toBeCloseTo(-Math.atan2(0.2, 0.4))
  })

  it('bounds extreme camera movement and rejects unusable measurements', () => {
    expect(calibrateFaceScale(1, 0.4)).toBe(1.3)
    expect(calibrateFaceScale(0.1, 0.4)).toBe(0.75)
    expect(calibrateFaceScale(Number.NaN, 0.4)).toBe(1)
    expect(estimateFaceWidth({ faceLandmarks: [] } as unknown as FaceLandmarkerResult)).toBeNull()
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

describe('faceTrackingFrameFromResult', () => {
  it('keeps runtime parameters separate from renderer placement', () => {
    const result = {
      faceLandmarks: [landmarksWithFaceWidth(0.48)],
      faceBlendshapes: [{ categories: [] }],
    } as unknown as FaceLandmarkerResult

    const frame = faceTrackingFrameFromResult(result, 0.4)
    expect(frame?.viewTransform.scale).toBeCloseTo(1.2)
    expect(frame?.viewTransform).toMatchObject({
      x: 0.5,
      y: 0.4,
      faceWidth: 0.48,
      rotation: 0,
    })
    expect(frame?.landmarks).toHaveLength(455)
    expect(frame?.parameters).not.toHaveProperty('scale')
    expect(frame?.parameters).not.toHaveProperty('x')
  })
})
