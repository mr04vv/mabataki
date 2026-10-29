export interface AvatarSurfaceRegion {
  left: number
  top: number
  right: number
  bottom: number
  pivotX: number
  pivotY: number
  /** Authored face depth in source-image pixels. */
  depth: number
}

export interface AvatarSurfacePlacement {
  /** Mirrored horizontal face center in normalized camera coordinates. */
  x: number
  /** Vertical face center in normalized camera coordinates. */
  y: number
  /** Observed, yaw-foreshortened face width in normalized camera coordinates. */
  faceWidth: number
}

export interface AvatarSurfacePose {
  yaw: number
  pitch: number
  roll: number
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value))
}

function smoothstep(edge0: number, edge1: number, value: number): number {
  const progress = clamp((value - edge0) / (edge1 - edge0), 0, 1)
  return progress * progress * (3 - 2 * progress)
}

/**
 * Projects the authored avatar mesh as a shallow 2.5D surface. MediaPipe owns
 * only placement and rigid face pose; authored vertices and Runtime expression
 * deformation remain the source of the character's shape.
 */
export function projectAvatarSurfacePositions(
  vertices: ArrayLike<number>,
  region: AvatarSurfaceRegion,
  placement: AvatarSurfacePlacement,
  pose: AvatarSurfacePose,
  neutralPose: AvatarSurfacePose,
  sceneWidth: number,
  sceneHeight: number,
): Float32Array {
  if (vertices.length % 2 !== 0) throw new Error('avatar surface vertices must contain x/y pairs')
  if (
    ![
      region.left,
      region.top,
      region.right,
      region.bottom,
      region.pivotX,
      region.pivotY,
      region.depth,
      placement.x,
      placement.y,
      placement.faceWidth,
      pose.yaw,
      pose.pitch,
      pose.roll,
      neutralPose.yaw,
      neutralPose.pitch,
      neutralPose.roll,
      sceneWidth,
      sceneHeight,
    ].every(Number.isFinite) ||
    region.right <= region.left ||
    region.bottom <= region.top ||
    region.depth < 0 ||
    placement.faceWidth <= 0 ||
    sceneWidth <= 0 ||
    sceneHeight <= 0
  ) throw new Error('avatar surface projection values are invalid')

  // FacePose yaw is already mirrored for the selfie preview. The surface
  // rotation uses the opposite handedness, so convert it at this boundary.
  const yaw = clamp(neutralPose.yaw - pose.yaw, -Math.PI * 0.42, Math.PI * 0.42)
  const pitch = clamp(pose.pitch - neutralPose.pitch, -Math.PI * 0.3, Math.PI * 0.3)
  const roll = pose.roll - neutralPose.roll
  const cosYaw = Math.cos(yaw)
  const sinYaw = Math.sin(yaw)
  const cosPitch = Math.cos(pitch)
  const sinPitch = Math.sin(pitch)
  const cosRoll = Math.cos(roll)
  const sinRoll = Math.sin(roll)
  const regionWidth = region.right - region.left
  const regionHeight = region.bottom - region.top
  const centerX = (region.left + region.right) / 2
  const centerY = (region.top + region.bottom) / 2
  // The observed landmark width already includes yaw foreshortening. Recover
  // face-on scale before projecting the authored surface through the same yaw.
  const faceOnWidth = placement.faceWidth * sceneWidth / Math.max(0.55, cosYaw)
  const scale = faceOnWidth / regionWidth
  const focalLength = regionWidth * 3.5
  const anchorX = placement.x * sceneWidth
  const anchorY = placement.y * sceneHeight
  const result = new Float32Array(vertices.length)

  for (let offset = 0; offset < vertices.length; offset += 2) {
    const sourceX = vertices[offset]
    const sourceY = vertices[offset + 1]
    const localX = sourceX - region.pivotX
    const localY = sourceY - region.pivotY
    const normalizedX = (sourceX - centerX) / (regionWidth / 2)
    const normalizedY = (sourceY - centerY) / (regionHeight / 2)
    const radiusSquared = normalizedX ** 2 + normalizedY ** 2
    const depth = -region.depth * Math.max(0, 1 - radiusSquared)
    const faceWeight = 1 - smoothstep(1, 1.35, radiusSquared)

    const yawX = cosYaw * localX + sinYaw * depth
    const yawZ = -sinYaw * localX + cosYaw * depth
    const pitchY = cosPitch * localY - sinPitch * yawZ
    const pitchZ = sinPitch * localY + cosPitch * yawZ
    // Use depth change rather than absolute depth so the calibrated frontal
    // frame is pixel-identical to an affine placement of the authored mesh.
    const depthDelta = pitchZ - depth
    const perspective = focalLength /
      Math.max(focalLength * 0.45, focalLength + depthDelta)
    const projectedX = localX + (yawX * perspective - localX) * faceWeight
    const projectedY = localY + (pitchY * perspective - localY) * faceWeight
    const rolledX = cosRoll * projectedX - sinRoll * projectedY
    const rolledY = sinRoll * projectedX + cosRoll * projectedY
    result[offset] = anchorX + rolledX * scale
    result[offset + 1] = anchorY + rolledY * scale
  }
  return result
}
