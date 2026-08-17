import { FaceLandmarker } from '@mediapipe/tasks-vision'

export type { NormalizedLandmark } from '@mediapipe/tasks-vision'
export {
  calibrateEyeOpen,
  calibrateFaceScale,
  calibrateJawOpen,
  estimateFacePlacement,
  estimateFaceWidth,
  estimateHeadRoll,
  estimateHeadYaw,
  faceTrackingFrameFromResult,
  faceValuesFromResult,
  MediaPipeFaceTracker,
} from './face-tracker.js'
export type {
  FacePlacement,
  FaceTrackingFrame,
  FaceTrackingValues,
  FaceViewTransform,
} from './face-tracker.js'
export { estimateEyeAccessoryAnchor } from './accessory-tracking.js'
export type { EyeAccessoryAnchor } from './accessory-tracking.js'
export { confidenceToAlpha, MediaPipePersonSegmenter } from './person-segmenter.js'
export type { PersonMask } from './person-segmenter.js'

export interface FaceMeshConnection {
  start: number
  end: number
}

export const FACE_MESH_CONNECTIONS: readonly FaceMeshConnection[] =
  FaceLandmarker.FACE_LANDMARKS_TESSELATION
