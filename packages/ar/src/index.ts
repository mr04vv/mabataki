export type FaceFilterKind = 'accessory' | 'face-mask'
export type FaceFilterTrackingAnchor = 'face' | 'eyes'

export interface FaceFilterAsset {
  type: 'builtin' | 'gltf'
  src: string
}

export interface FaceFilterTransform {
  /** Translation in face-width units. */
  position: readonly [number, number, number]
  /** Additional local Euler rotation in radians. */
  rotation: readonly [number, number, number]
  scale: number
}

export interface FaceFilterManifest {
  version: 1
  id: string
  name: string
  kind: FaceFilterKind
  /** Projected landmark anchor used to keep the asset attached on screen. */
  trackingAnchor: FaceFilterTrackingAnchor
  asset: FaceFilterAsset
  /** Width of the authored face reference in model units. */
  modelFaceWidth: number
  transform: FaceFilterTransform
  occlusion: 'none' | 'face'
  expressions?: Readonly<Record<string, string>>
}

export interface FaceFilterTrackingFrame {
  /** Mirrored face center in normalized camera coordinates. */
  x: number
  y: number
  /** Observed face width in normalized camera coordinates. */
  faceWidth: number
  /** Mirrored physical pose in radians. */
  yaw: number
  pitch: number
  roll: number
  expressions: Readonly<Record<string, number>>
}

export interface ResolvedFaceFilterTransform {
  position: readonly [number, number, number]
  rotation: readonly [number, number, number]
  scale: number
}

function finiteTuple(value: unknown): value is readonly [number, number, number] {
  return Array.isArray(value) && value.length === 3 && value.every(Number.isFinite)
}

export function validateFaceFilterManifest(value: unknown): FaceFilterManifest {
  if (typeof value !== 'object' || value === null) throw new Error('filter manifest must be an object')
  const manifest = value as Partial<FaceFilterManifest>
  if (manifest.version !== 1) throw new Error('filter manifest version must be 1')
  if (typeof manifest.id !== 'string' || manifest.id.length === 0) {
    throw new Error('filter manifest id must be a non-empty string')
  }
  if (typeof manifest.name !== 'string' || manifest.name.length === 0) {
    throw new Error('filter manifest name must be a non-empty string')
  }
  if (manifest.kind !== 'accessory' && manifest.kind !== 'face-mask') {
    throw new Error('filter manifest kind is invalid')
  }
  if (manifest.trackingAnchor !== 'face' && manifest.trackingAnchor !== 'eyes') {
    throw new Error('filter manifest trackingAnchor is invalid')
  }
  if (
    typeof manifest.asset !== 'object' ||
    manifest.asset === null ||
    (manifest.asset.type !== 'builtin' && manifest.asset.type !== 'gltf') ||
    typeof manifest.asset.src !== 'string' ||
    manifest.asset.src.length === 0
  ) throw new Error('filter manifest asset is invalid')
  if (!Number.isFinite(manifest.modelFaceWidth) || (manifest.modelFaceWidth ?? 0) <= 0) {
    throw new Error('filter manifest modelFaceWidth must be positive')
  }
  if (
    typeof manifest.transform !== 'object' ||
    manifest.transform === null ||
    !finiteTuple(manifest.transform.position) ||
    !finiteTuple(manifest.transform.rotation) ||
    !Number.isFinite(manifest.transform.scale) ||
    manifest.transform.scale <= 0
  ) throw new Error('filter manifest transform is invalid')
  if (manifest.occlusion !== 'none' && manifest.occlusion !== 'face') {
    throw new Error('filter manifest occlusion is invalid')
  }
  return manifest as FaceFilterManifest
}

/** Resolves tracker output into an orthographic Three/WebGL scene transform. */
export function resolveFaceFilterTransform(
  manifestValue: FaceFilterManifest,
  frame: FaceFilterTrackingFrame,
  viewportAspect: number,
): ResolvedFaceFilterTransform {
  const manifest = validateFaceFilterManifest(manifestValue)
  if (
    ![
      frame.x,
      frame.y,
      frame.faceWidth,
      frame.yaw,
      frame.pitch,
      frame.roll,
      viewportAspect,
    ].every(Number.isFinite) ||
    frame.faceWidth <= 0 ||
    viewportAspect <= 0
  ) throw new Error('face filter tracking frame is invalid')

  const faceOnWidth = frame.faceWidth * 2 * viewportAspect /
    Math.max(0.55, Math.cos(frame.yaw))
  const scale = faceOnWidth / manifest.modelFaceWidth * manifest.transform.scale
  const [offsetX, offsetY, offsetZ] = manifest.transform.position
  const [rotationX, rotationY, rotationZ] = manifest.transform.rotation
  const poseX = -frame.pitch
  const poseY = frame.yaw
  const poseZ = -frame.roll
  const localX = offsetX * faceOnWidth
  const localY = offsetY * faceOnWidth
  const localZ = offsetZ * faceOnWidth
  const rollX = Math.cos(poseZ) * localX - Math.sin(poseZ) * localY
  const rollY = Math.sin(poseZ) * localX + Math.cos(poseZ) * localY
  const pitchY = Math.cos(poseX) * rollY - Math.sin(poseX) * localZ
  const pitchZ = Math.sin(poseX) * rollY + Math.cos(poseX) * localZ
  const rotatedOffsetX = Math.cos(poseY) * rollX + Math.sin(poseY) * pitchZ
  const rotatedOffsetZ = -Math.sin(poseY) * rollX + Math.cos(poseY) * pitchZ
  return {
    position: [
      (frame.x - 0.5) * 2 * viewportAspect + rotatedOffsetX,
      (0.5 - frame.y) * 2 + pitchY,
      rotatedOffsetZ,
    ],
    // MediaPipe yaw is already mirrored for the selfie preview. Keep that
    // horizontal direction; only y-up pitch/roll change sign here.
    rotation: [
      poseX + rotationX,
      poseY + rotationY,
      poseZ + rotationZ,
    ],
    scale,
  }
}
