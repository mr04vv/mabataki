import { FaceLandmarker, FilesetResolver } from '@mediapipe/tasks-vision'
import type { Category, FaceLandmarkerResult, NormalizedLandmark } from '@mediapipe/tasks-vision'

const WASM_ROOT = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.0.1/wasm'
const MODEL_URL =
  'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task'
const JAW_OPEN_DEAD_ZONE = 0.04
const JAW_OPEN_FULL_SCALE = 0.55
const JAW_OPEN_GAMMA = 0.75
const HEAD_YAW_DEAD_ZONE = 0.015
const HEAD_YAW_FULL_SCALE = 0.16
const HEAD_ROLL_DEAD_ZONE = 2 * Math.PI / 180
const HEAD_ROLL_FULL_SCALE = 20 * Math.PI / 180
const EYE_BLINK_DEAD_ZONE = 0.08
const EYE_BLINK_FULL_SCALE = 0.65
const MIN_VIEW_SCALE = 0.75
const MAX_VIEW_SCALE = 1.3

export interface FaceTrackingValues {
  headYaw: number
  headRoll: number
  eyeOpenLeft: number
  eyeOpenRight: number
  mouthOpen: number
  mouthSmileLeft: number
  mouthSmileRight: number
}

/** Camera-space placement consumed by a renderer, never by MabatakiRuntime. */
export interface FaceViewTransform {
  /** Mirrored horizontal face center in normalized camera coordinates. */
  x: number
  /** Vertical face center in normalized camera coordinates. */
  y: number
  /** Face width in normalized camera coordinates. */
  faceWidth: number
  /** Mirrored face-edge angle in radians, before parameter calibration. */
  rotation: number
  scale: number
}

export interface FaceTrackingFrame {
  parameters: FaceTrackingValues
  viewTransform: FaceViewTransform
  /** Raw tracker geometry for compositor/debug views; never consumed by the runtime. */
  landmarks: NormalizedLandmark[]
}

export interface FacePlacement {
  x: number
  y: number
  faceWidth: number
  rotation: number
}

export function estimateFacePlacement(result: FaceLandmarkerResult): FacePlacement | null {
  const landmarks = result.faceLandmarks?.[0]
  const leftFace = landmarks?.[234]
  const rightFace = landmarks?.[454]
  if (leftFace === undefined || rightFace === undefined) return null
  const dx = rightFace.x - leftFace.x
  const dy = rightFace.y - leftFace.y
  const faceWidth = Math.hypot(dx, dy)
  if (faceWidth <= Number.EPSILON) return null
  return {
    x: 1 - (leftFace.x + rightFace.x) / 2,
    y: (leftFace.y + rightFace.y) / 2,
    faceWidth,
    rotation: dy === 0 ? 0 : -Math.atan2(dy, dx),
  }
}

export function estimateFaceWidth(result: FaceLandmarkerResult): number | null {
  return estimateFacePlacement(result)?.faceWidth ?? null
}

/** Converts camera-space face size to a bounded scale relative to the first frame. */
export function calibrateFaceScale(faceWidth: number, neutralFaceWidth: number): number {
  if (
    !Number.isFinite(faceWidth) ||
    !Number.isFinite(neutralFaceWidth) ||
    faceWidth <= 0 ||
    neutralFaceWidth <= 0
  ) return 1
  return Math.min(MAX_VIEW_SCALE, Math.max(MIN_VIEW_SCALE, faceWidth / neutralFaceWidth))
}

export function estimateHeadRoll(result: FaceLandmarkerResult): number {
  const landmarks = result.faceLandmarks?.[0]
  const leftFace = landmarks?.[234]
  const rightFace = landmarks?.[454]
  if (leftFace === undefined || rightFace === undefined) return 0
  const raw = Math.atan2(rightFace.y - leftFace.y, rightFace.x - leftFace.x)
  const magnitude = Math.min(
    1,
    Math.max(
      0,
      (Math.abs(raw) - HEAD_ROLL_DEAD_ZONE) / (HEAD_ROLL_FULL_SCALE - HEAD_ROLL_DEAD_ZONE),
    ),
  )
  if (magnitude === 0) return 0
  // Horizontal camera mirroring reverses the apparent roll direction.
  return -Math.sign(raw) * magnitude
}

export function estimateHeadYaw(result: FaceLandmarkerResult): number {
  const landmarks = result.faceLandmarks?.[0]
  const nose = landmarks?.[1]
  const leftFace = landmarks?.[234]
  const rightFace = landmarks?.[454]
  if (nose === undefined || leftFace === undefined || rightFace === undefined) return 0
  const faceWidth = Math.abs(rightFace.x - leftFace.x)
  if (faceWidth < Number.EPSILON) return 0
  const centerX = (leftFace.x + rightFace.x) / 2
  const raw = (nose.x - centerX) / faceWidth
  const magnitude = Math.min(
    1,
    Math.max(0, (Math.abs(raw) - HEAD_YAW_DEAD_ZONE) / (HEAD_YAW_FULL_SCALE - HEAD_YAW_DEAD_ZONE)),
  )
  // The camera preview is mirrored, so mirror yaw as well to make the avatar
  // follow the direction the user sees on screen.
  return -Math.sign(raw) * magnitude
}

function score(categories: Category[], name: string): number {
  return categories.find((category) => category.categoryName === name)?.score ?? 0
}

/** Expands the useful speaking range while suppressing closed-mouth noise. */
export function calibrateJawOpen(raw: number): number {
  const normalized = Math.min(
    1,
    Math.max(0, (raw - JAW_OPEN_DEAD_ZONE) / (JAW_OPEN_FULL_SCALE - JAW_OPEN_DEAD_ZONE)),
  )
  return normalized ** JAW_OPEN_GAMMA
}

export function calibrateEyeOpen(blink: number): number {
  const closed = Math.min(
    1,
    Math.max(0, (blink - EYE_BLINK_DEAD_ZONE) / (EYE_BLINK_FULL_SCALE - EYE_BLINK_DEAD_ZONE)),
  )
  return 1 - closed
}

export function faceValuesFromResult(result: FaceLandmarkerResult): FaceTrackingValues | null {
  const categories = result.faceBlendshapes[0]?.categories
  if (categories === undefined) return null
  return {
    headYaw: estimateHeadYaw(result),
    headRoll: estimateHeadRoll(result),
    // The preview is mirrored, so tracker-left maps to avatar-right.
    eyeOpenLeft: calibrateEyeOpen(score(categories, 'eyeBlinkRight')),
    eyeOpenRight: calibrateEyeOpen(score(categories, 'eyeBlinkLeft')),
    mouthOpen: calibrateJawOpen(score(categories, 'jawOpen')),
    mouthSmileLeft: score(categories, 'mouthSmileLeft'),
    mouthSmileRight: score(categories, 'mouthSmileRight'),
  }
}

export function faceTrackingFrameFromResult(
  result: FaceLandmarkerResult,
  neutralFaceWidth: number | null,
): FaceTrackingFrame | null {
  const parameters = faceValuesFromResult(result)
  if (parameters === null) return null
  const placement = estimateFacePlacement(result)
  const faceWidth = placement?.faceWidth ?? null
  return {
    parameters,
    landmarks: result.faceLandmarks?.[0] ?? [],
    viewTransform: {
      x: placement?.x ?? 0.5,
      y: placement?.y ?? 0.5,
      faceWidth: placement?.faceWidth ?? 0,
      rotation: placement?.rotation ?? 0,
      scale: faceWidth === null || neutralFaceWidth === null
        ? 1
        : calibrateFaceScale(faceWidth, neutralFaceWidth),
    },
  }
}

export class MediaPipeFaceTracker {
  private neutralFaceWidth: number | null = null

  private constructor(
    private readonly landmarker: FaceLandmarker,
    private readonly stream: MediaStream,
    private readonly video: HTMLVideoElement,
  ) {}

  static async create(video: HTMLVideoElement): Promise<MediaPipeFaceTracker> {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } },
      audio: false,
    })
    video.srcObject = stream
    await video.play()
    try {
      const vision = await FilesetResolver.forVisionTasks(WASM_ROOT)
      const landmarker = await FaceLandmarker.createFromOptions(vision, {
        baseOptions: { modelAssetPath: MODEL_URL },
        runningMode: 'VIDEO',
        numFaces: 1,
        outputFaceBlendshapes: true,
      })
      return new MediaPipeFaceTracker(landmarker, stream, video)
    } catch (error) {
      for (const track of stream.getTracks()) track.stop()
      video.srcObject = null
      throw error
    }
  }

  sample(timestampMs: number): FaceTrackingFrame | null {
    if (this.video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) return null
    const result = this.landmarker.detectForVideo(this.video, timestampMs)
    this.neutralFaceWidth ??= estimateFaceWidth(result)
    return faceTrackingFrameFromResult(result, this.neutralFaceWidth)
  }

  close(): void {
    this.landmarker.close()
    for (const track of this.stream.getTracks()) track.stop()
    this.video.srcObject = null
  }
}
