import { FilesetResolver, ImageSegmenter } from '@mediapipe/tasks-vision'

const WASM_ROOT = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.0.1/wasm'
const MODEL_URL =
  'https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_segmenter/float16/latest/selfie_segmenter.tflite'

export interface PersonMask {
  confidence: Float32Array
  width: number
  height: number
}

/** Softens the person-mask edge while rejecting low-confidence background pixels. */
export function confidenceToAlpha(confidence: number): number {
  if (!Number.isFinite(confidence)) return 0
  return Math.round(Math.min(1, Math.max(0, (confidence - 0.2) / 0.6)) * 255)
}

export class MediaPipePersonSegmenter {
  private constructor(private readonly segmenter: ImageSegmenter) {}

  static async create(): Promise<MediaPipePersonSegmenter> {
    const vision = await FilesetResolver.forVisionTasks(WASM_ROOT)
    const segmenter = await ImageSegmenter.createFromOptions(vision, {
      baseOptions: { modelAssetPath: MODEL_URL },
      runningMode: 'VIDEO',
      outputConfidenceMasks: true,
      outputCategoryMask: false,
    })
    return new MediaPipePersonSegmenter(segmenter)
  }

  sample(video: HTMLVideoElement, timestampMs: number): PersonMask | null {
    if (video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) return null
    let personMask: PersonMask | null = null
    this.segmenter.segmentForVideo(video, timestampMs, (result) => {
      const mask = result.confidenceMasks?.[0]
      if (mask === undefined) return
      personMask = {
        confidence: Float32Array.from(mask.getAsFloat32Array()),
        width: mask.width,
        height: mask.height,
      }
    })
    return personMask
  }

  close(): void {
    this.segmenter.close()
  }
}
