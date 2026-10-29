import { describe, expect, it } from 'vitest'
import {
  resolveFaceFilterTransform,
  validateFaceFilterManifest,
} from './index'
import type { FaceFilterManifest } from './index'

const manifest: FaceFilterManifest = {
  version: 1,
  id: 'glasses',
  name: 'Glasses',
  kind: 'accessory',
  trackingAnchor: 'eyes',
  asset: { type: 'builtin', src: 'glasses' },
  modelFaceWidth: 2,
  transform: {
    position: [0, 0.2, 0],
    rotation: [0, 0, 0],
    scale: 1,
  },
  occlusion: 'face',
}

describe('face filter manifest', () => {
  it('validates an authorable filter contract', () => {
    expect(validateFaceFilterManifest(manifest)).toBe(manifest)
  })

  it('rejects an invalid model scale', () => {
    expect(() => validateFaceFilterManifest({ ...manifest, modelFaceWidth: 0 }))
      .toThrow(/modelFaceWidth/)
  })

  it('rejects an unknown tracking anchor', () => {
    expect(() => validateFaceFilterManifest({ ...manifest, trackingAnchor: 'nose' }))
      .toThrow(/trackingAnchor/)
  })
})

describe('resolveFaceFilterTransform', () => {
  it('maps mirrored tracking coordinates into a y-up scene', () => {
    const resolved = resolveFaceFilterTransform(
      manifest,
      {
        x: 0.75,
        y: 0.25,
        faceWidth: 0.2,
        yaw: 0,
        pitch: 0,
        roll: 0,
        expressions: {},
      },
      2,
    )

    expect(resolved.position).toEqual([1, 0.66, 0])
    expect(resolved.scale).toBeCloseTo(0.4)
  })

  it('recovers face-on scale and preserves mirrored selfie yaw', () => {
    const yaw = Math.PI / 4
    const resolved = resolveFaceFilterTransform(
      manifest,
      {
        x: 0.5,
        y: 0.5,
        faceWidth: 0.2 * Math.cos(yaw),
        yaw,
        pitch: 0.1,
        roll: -0.2,
        expressions: {},
      },
      1,
    )

    expect(resolved.scale).toBeCloseTo(0.2)
    expect(resolved.rotation).toEqual([-0.1, yaw, 0.2])
  })

  it('rotates authored placement offsets with the tracked face', () => {
    const resolved = resolveFaceFilterTransform(
      manifest,
      {
        x: 0.5,
        y: 0.5,
        faceWidth: 0.2,
        yaw: 0,
        pitch: 0,
        roll: -Math.PI / 2,
        expressions: {},
      },
      1,
    )

    expect(resolved.position[0]).toBeCloseTo(-0.08)
    expect(resolved.position[1]).toBeCloseTo(0)
    expect(resolved.position[2]).toBeCloseTo(0)
  })
})
