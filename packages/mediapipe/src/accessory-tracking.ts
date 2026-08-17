import type { NormalizedLandmark } from '@mediapipe/tasks-vision'

const LEFT_OUTER_EYE = 33
const RIGHT_OUTER_EYE = 263

export interface EyeAccessoryAnchor {
  x: number
  y: number
  eyeSpan: number
  rotation: number
}

/**
 * Tracks a rigid face accessory from the projected eye line. Cheek landmarks
 * are useful for whole-face scale, but their midpoint drifts under head yaw.
 */
export function estimateEyeAccessoryAnchor(
  landmarks: ReadonlyArray<NormalizedLandmark>,
): EyeAccessoryAnchor | null {
  const leftEye = landmarks[LEFT_OUTER_EYE]
  const rightEye = landmarks[RIGHT_OUTER_EYE]
  if (leftEye === undefined || rightEye === undefined) return null
  const dx = rightEye.x - leftEye.x
  const dy = rightEye.y - leftEye.y
  const eyeSpan = Math.hypot(dx, dy)
  if (!Number.isFinite(eyeSpan) || eyeSpan <= Number.EPSILON) return null
  return {
    x: 1 - (leftEye.x + rightEye.x) / 2,
    y: (leftEye.y + rightEye.y) / 2,
    eyeSpan,
    rotation: dy === 0 ? 0 : -Math.atan2(dy, dx),
  }
}
