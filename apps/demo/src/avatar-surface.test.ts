import { describe, expect, it } from 'vitest'
import { projectAvatarSurfacePositions } from './avatar-surface'

const region = {
  left: 0,
  top: 0,
  right: 200,
  bottom: 200,
  pivotX: 100,
  pivotY: 100,
  depth: 50,
}
const placement = { x: 0.5, y: 0.5, faceWidth: 0.2 }
const neutralPose = { yaw: 0, pitch: 0, roll: 0 }

describe('projectAvatarSurfacePositions', () => {
  it('preserves the authored mesh exactly in the calibrated frontal pose', () => {
    const projected = projectAvatarSurfacePositions(
      [0, 0, 100, 100, 200, 200],
      region,
      placement,
      neutralPose,
      neutralPose,
      1000,
      500,
    )

    expect([...projected]).toEqual([400, 150, 500, 250, 600, 350])
  })

  it('uses yaw to turn the authored surface without copying live face vertices', () => {
    const yaw = Math.PI / 4
    const projected = projectAvatarSurfacePositions(
      [0, 100, 100, 100, 200, 100],
      region,
      { ...placement, faceWidth: placement.faceWidth * Math.cos(yaw) },
      { ...neutralPose, yaw },
      neutralPose,
      1000,
      500,
    )

    expect(projected[0]).toBeGreaterThan(400)
    expect(projected[4]).toBeLessThan(600)
    // MediaPipe yaw is mirrored for the selfie preview; projection converts
    // that value into the surface coordinate system at its boundary.
    expect(projected[2]).toBeGreaterThan(500)
  })

  it('leaves vertices outside the face region rigidly attached to the avatar', () => {
    const yaw = Math.PI / 4
    const projected = projectAvatarSurfacePositions(
      [100, 400],
      region,
      { ...placement, faceWidth: placement.faceWidth * Math.cos(yaw) },
      { yaw, pitch: Math.PI / 6, roll: 0 },
      neutralPose,
      1000,
      500,
    )

    expect([...projected]).toEqual([500, 550])
  })

  it('rejects malformed projection input', () => {
    expect(() => projectAvatarSurfacePositions(
      [0],
      region,
      placement,
      neutralPose,
      neutralPose,
      1000,
      500,
    )).toThrow(/x\/y pairs/)
  })
})
