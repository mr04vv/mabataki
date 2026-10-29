import { estimateEyeAccessoryAnchor } from '@mabataki/mediapipe'
import type { FaceTrackingFrame } from '@mabataki/mediapipe'
import type {
  FaceFilterTrackingAnchor,
  FaceFilterTrackingFrame,
} from '@mabataki/ar'

/**
 * Combines a stable projected landmark anchor with MediaPipe's rigid 3D pose.
 * Eye accessories must not use the cheek midpoint because it slides under yaw.
 */
export function faceFilterTrackingTarget(
  frame: FaceTrackingFrame,
  trackingAnchor: FaceFilterTrackingAnchor,
): FaceFilterTrackingFrame {
  const eyeAnchor = trackingAnchor === 'eyes'
    ? estimateEyeAccessoryAnchor(frame.landmarks)
    : null
  return {
    x: eyeAnchor?.x ?? frame.viewTransform.x,
    y: eyeAnchor?.y ?? frame.viewTransform.y,
    faceWidth: frame.viewTransform.faceWidth,
    yaw: frame.facePose?.yaw ?? frame.parameters.headYaw * Math.PI * 35 / 180,
    pitch: frame.facePose?.pitch ?? 0,
    roll: eyeAnchor?.rotation ?? frame.facePose?.roll ??
      frame.parameters.headRoll * Math.PI * 20 / 180,
    expressions: { ...frame.parameters },
  }
}
