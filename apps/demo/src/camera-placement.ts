export interface EyeAnchorPlacement {
  x: number
  y: number
  eyeSpan: number
  rotation: number
}

export interface EyeAccessoryAdjustment {
  /** Vertical offset in hundredths of the tracked eye span. */
  offsetY: number
  scale: number
}

export interface ResolvedEyeAccessoryPlacement {
  x: number
  y: number
  scale: number
  rotation: number
}

export interface FaceAccessoryPose {
  yaw: number
  pitch: number
}

export interface AccessoryMeshGrid {
  /** Source-pixel coordinates relative to the authored accessory pivot. */
  localPoints: Float32Array
  uvs: Float32Array
  indices: Uint32Array
}

export interface AccessoryMeshGridOptions {
  columns: number
  rows: number
  left: number
  top: number
  right: number
  bottom: number
  pivotX: number
  pivotY: number
  textureWidth: number
  textureHeight: number
}

/** Builds a cropped grid so transparent texture padding is not projected. */
export function createAccessoryMeshGrid(options: AccessoryMeshGridOptions): AccessoryMeshGrid {
  const {
    columns,
    rows,
    left,
    top,
    right,
    bottom,
    pivotX,
    pivotY,
    textureWidth,
    textureHeight,
  } = options
  if (
    !Number.isInteger(columns) ||
    !Number.isInteger(rows) ||
    columns < 2 ||
    rows < 2 ||
    ![left, top, right, bottom, pivotX, pivotY, textureWidth, textureHeight]
      .every(Number.isFinite) ||
    right <= left ||
    bottom <= top ||
    textureWidth <= 0 ||
    textureHeight <= 0
  ) throw new Error('accessory mesh grid options are invalid')

  const localPoints = new Float32Array(columns * rows * 2)
  const uvs = new Float32Array(columns * rows * 2)
  for (let row = 0; row < rows; row++) {
    const rowProgress = row / (rows - 1)
    const sourceY = top + (bottom - top) * rowProgress
    for (let column = 0; column < columns; column++) {
      const columnProgress = column / (columns - 1)
      const sourceX = left + (right - left) * columnProgress
      const offset = (row * columns + column) * 2
      localPoints[offset] = sourceX - pivotX
      localPoints[offset + 1] = sourceY - pivotY
      uvs[offset] = sourceX / textureWidth
      uvs[offset + 1] = sourceY / textureHeight
    }
  }

  const indices = new Uint32Array((columns - 1) * (rows - 1) * 6)
  let indexOffset = 0
  for (let row = 0; row < rows - 1; row++) {
    for (let column = 0; column < columns - 1; column++) {
      const topLeft = row * columns + column
      const topRight = topLeft + 1
      const bottomLeft = topLeft + columns
      const bottomRight = bottomLeft + 1
      indices.set([
        topLeft,
        bottomLeft,
        topRight,
        topRight,
        bottomLeft,
        bottomRight,
      ], indexOffset)
      indexOffset += 6
    }
  }
  return { localPoints, uvs, indices }
}

/**
 * Resolves a face-local accessory adjustment without exposing a manual screen X.
 * Vertical authoring offsets rotate with the eye line and scale with the face.
 */
export function resolveEyeAccessoryPlacement(
  anchor: EyeAnchorPlacement,
  adjustment: EyeAccessoryAdjustment,
  sceneWidth: number,
  sceneHeight: number,
  accessoryEyeSpan: number,
): ResolvedEyeAccessoryPlacement {
  if (
    !Number.isFinite(sceneWidth) ||
    !Number.isFinite(sceneHeight) ||
    !Number.isFinite(accessoryEyeSpan) ||
    sceneWidth <= 0 ||
    sceneHeight <= 0 ||
    accessoryEyeSpan <= 0
  ) {
    throw new Error('accessory placement dimensions must be positive')
  }
  const eyeSpanPx = anchor.eyeSpan * sceneWidth
  const localY = adjustment.offsetY / 100 * eyeSpanPx
  return {
    x: anchor.x * sceneWidth - Math.sin(anchor.rotation) * localY,
    y: anchor.y * sceneHeight + Math.cos(anchor.rotation) * localY,
    scale: eyeSpanPx / accessoryEyeSpan * adjustment.scale,
    rotation: anchor.rotation,
  }
}

/**
 * Projects an authored 2D accessory grid through a lightweight perspective camera.
 * Eye landmarks own screen placement; canonical face pose only supplies yaw/pitch.
 */
export function projectEyeAccessoryMesh(
  anchor: EyeAnchorPlacement,
  adjustment: EyeAccessoryAdjustment,
  pose: FaceAccessoryPose,
  sceneWidth: number,
  sceneHeight: number,
  accessoryEyeSpan: number,
  localPoints: ArrayLike<number>,
): Float32Array {
  if (localPoints.length % 2 !== 0) throw new Error('accessory mesh points must contain x/y pairs')
  const yaw = Math.min(Math.PI * 0.42, Math.max(-Math.PI * 0.42, pose.yaw))
  const pitch = Math.min(Math.PI * 0.3, Math.max(-Math.PI * 0.3, pose.pitch))
  // The landmark eye span is already foreshortened by yaw. Recover its
  // face-on scale before projecting the mesh, otherwise yaw is applied twice.
  const faceOnAnchor = {
    ...anchor,
    eyeSpan: anchor.eyeSpan / Math.max(0.55, Math.cos(yaw)),
  }
  const resolved = resolveEyeAccessoryPlacement(
    faceOnAnchor,
    adjustment,
    sceneWidth,
    sceneHeight,
    accessoryEyeSpan,
  )
  const cosYaw = Math.cos(yaw)
  const sinYaw = Math.sin(yaw)
  const cosPitch = Math.cos(pitch)
  const sinPitch = Math.sin(pitch)
  const cosRoll = Math.cos(resolved.rotation)
  const sinRoll = Math.sin(resolved.rotation)
  const focalLength = accessoryEyeSpan * 3.5
  const result = new Float32Array(localPoints.length)

  for (let offset = 0; offset < localPoints.length; offset += 2) {
    const localX = localPoints[offset]
    const localY = localPoints[offset + 1]
    const yawX = cosYaw * localX
    const yawZ = -sinYaw * localX
    const pitchY = cosPitch * localY - sinPitch * yawZ
    const pitchZ = sinPitch * localY + cosPitch * yawZ
    const perspective = focalLength / Math.max(focalLength * 0.35, focalLength + pitchZ)
    const projectedX = yawX * perspective * resolved.scale
    const projectedY = pitchY * perspective * resolved.scale
    result[offset] = resolved.x + cosRoll * projectedX - sinRoll * projectedY
    result[offset + 1] = resolved.y + sinRoll * projectedX + cosRoll * projectedY
  }
  return result
}
