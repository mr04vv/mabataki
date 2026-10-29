import { FaceLandmarker } from '@mediapipe/tasks-vision'

export type { NormalizedLandmark } from '@mediapipe/tasks-vision'
export {
  applyFacePoseToParameters,
  calibratePoseAngle,
  calibrateEyeOpen,
  calibrateFaceScale,
  calibrateJawOpen,
  DEFAULT_FACE_POSE_PARAMETER_CALIBRATION,
  estimateFacePlacement,
  estimateFaceWidth,
  estimateHeadRoll,
  estimateHeadYaw,
  facePoseFromResult,
  faceTrackingFrameFromResult,
  faceValuesFromResult,
  MediaPipeFaceTracker,
} from './face-tracker.js'
export type {
  FacePlacement,
  FacePose,
  FacePoseParameterCalibration,
  FaceTrackingFrame,
  FaceTrackingValues,
  FaceViewTransform,
} from './face-tracker.js'
export { estimateEyeAccessoryAnchor } from './accessory-tracking.js'
export type { EyeAccessoryAnchor } from './accessory-tracking.js'

export interface FaceMeshConnection {
  start: number
  end: number
}

export const FACE_MESH_CONNECTIONS: readonly FaceMeshConnection[] =
  FaceLandmarker.FACE_LANDMARKS_TESSELATION
