import { describe, expect, it } from 'vitest'
import type { FaceLandmarkerResult } from '@mediapipe/tasks-vision'
import {
  applyFacePoseToParameters,
  calibrateFaceScale,
  calibrateEyeOpen,
  calibrateJawOpen,
  calibratePoseAngle,
  estimateFacePlacement,
  estimateFaceWidth,
  estimateHeadRoll,
  estimateHeadYaw,
  facePoseFromResult,
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

describe('facePoseFromResult', () => {
  it('extracts and mirrors rotation from a column-major face transform', () => {
    const yaw = Math.PI / 6
    const result = {
      facialTransformationMatrixes: [{
        rows: 4,
        columns: 4,
        data: [
          Math.cos(yaw), 0, -Math.sin(yaw), 0,
          0, 1, 0, 0,
          Math.sin(yaw), 0, Math.cos(yaw), 0,
          0, 0, 0, 1,
        ],
      }],
    } as unknown as FaceLandmarkerResult

    const pose = facePoseFromResult(result)
    expect(pose?.yaw).toBeCloseTo(-yaw)
    expect(pose?.pitch).toBeCloseTo(0)
    expect(pose?.roll).toBeCloseTo(0)
    expect(pose?.matrix).toHaveLength(16)
  })

  it('normalizes matrix scale and can preserve unmirrored coordinates', () => {
    const roll = Math.PI / 8
    const scale = 2.5
    const result = {
      facialTransformationMatrixes: [{
        rows: 4,
        columns: 4,
        data: [
          Math.cos(roll) * scale, Math.sin(roll) * scale, 0, 0,
          -Math.sin(roll) * scale, Math.cos(roll) * scale, 0, 0,
          0, 0, scale, 0,
          0, 0, 0, 1,
        ],
      }],
    } as FaceLandmarkerResult

    expect(facePoseFromResult(result, false)?.roll).toBeCloseTo(roll)
  })

  it('rejects missing, malformed, and non-finite matrices', () => {
    expect(facePoseFromResult({} as FaceLandmarkerResult)).toBeNull()
    expect(facePoseFromResult({
      facialTransformationMatrixes: [{ rows: 4, columns: 4 }],
    } as FaceLandmarkerResult)).toBeNull()
    expect(facePoseFromResult({
      facialTransformationMatrixes: [{ rows: 3, columns: 3, data: Array(9).fill(0) }],
    } as FaceLandmarkerResult)).toBeNull()
    expect(facePoseFromResult({
      facialTransformationMatrixes: [{
        rows: 4,
        columns: 4,
        data: [...Array(15).fill(0), Number.NaN],
      }],
    } as FaceLandmarkerResult)).toBeNull()
  })
})

describe('physical pose parameter calibration', () => {
  it('maps authored physical angles linearly to normalized key poses', () => {
    const fullScale = 35 * Math.PI / 180
    expect(calibratePoseAngle(0, 0, fullScale)).toBe(0)
    expect(calibratePoseAngle(fullScale / 2, 0, fullScale)).toBeCloseTo(0.5)
    expect(calibratePoseAngle(-fullScale, 0, fullScale)).toBe(-1)
    expect(calibratePoseAngle(fullScale * 2, 0, fullScale)).toBe(1)
  })

  it('replaces only pose parameters and preserves expression tracking', () => {
    const parameters = {
      headYaw: 0.9,
      headRoll: -0.9,
      eyeOpenLeft: 0.8,
      eyeOpenRight: 0.7,
      mouthOpen: 0.6,
      mouthSmileLeft: 0.5,
      mouthSmileRight: 0.4,
    }
    const pose = {
      matrix: Array(16).fill(0),
      yaw: 10 * Math.PI / 180,
      pitch: 5 * Math.PI / 180,
      roll: -5 * Math.PI / 180,
    }
    const calibrated = applyFacePoseToParameters(parameters, pose, {
      headYawFullScaleRadians: 20 * Math.PI / 180,
      headRollFullScaleRadians: 10 * Math.PI / 180,
      neutralYawRadians: 0,
      neutralRollRadians: 0,
    })

    expect(calibrated.headYaw).toBeCloseTo(0.5)
    expect(calibrated.headRoll).toBeCloseTo(-0.5)
    expect(calibrated.mouthOpen).toBe(0.6)
    expect(calibrated.eyeOpenLeft).toBe(0.8)
  })

  it('falls back to landmark parameters when no transformation matrix is available', () => {
    const parameters = {
      headYaw: 0.4,
      headRoll: -0.3,
      eyeOpenLeft: 1,
      eyeOpenRight: 1,
      mouthOpen: 0,
      mouthSmileLeft: 0,
      mouthSmileRight: 0,
    }
    expect(applyFacePoseToParameters(parameters, null)).toBe(parameters)
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
    expect(frame?.facePose).toBeNull()
    expect(frame?.parameters).not.toHaveProperty('scale')
    expect(frame?.parameters).not.toHaveProperty('x')
  })

  it('drives yaw from the physical face pose instead of the landmark heuristic', () => {
    const yaw = 17.5 * Math.PI / 180
    const landmarks = landmarksWithFaceWidth(0.4)
    landmarks[1].x = 0.56
    const result = {
      faceLandmarks: [landmarks],
      faceBlendshapes: [{ categories: [] }],
      facialTransformationMatrixes: [{
        rows: 4,
        columns: 4,
        data: [
          Math.cos(-yaw), 0, -Math.sin(-yaw), 0,
          0, 1, 0, 0,
          Math.sin(-yaw), 0, Math.cos(-yaw), 0,
          0, 0, 0, 1,
        ],
      }],
    } as unknown as FaceLandmarkerResult

    const landmarkYaw = estimateHeadYaw(result)
    const frame = faceTrackingFrameFromResult(result, 0.4)
    expect(landmarkYaw).not.toBeCloseTo(0.5)
    expect(frame?.facePose?.yaw).toBeCloseTo(yaw)
    expect(frame?.parameters.headYaw).toBeCloseTo(0.5)
  })
})
