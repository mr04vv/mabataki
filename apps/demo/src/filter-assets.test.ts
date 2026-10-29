import { describe, expect, it } from 'vitest'
import { validateFaceFilterManifest } from '@mabataki/ar'
import {
  createBuiltinFilter,
  FILTERS,
  GLASSES_FILTER,
  ROBOT_MASK_FILTER,
} from './filter-assets'

describe('demo face filters', () => {
  it('ships valid accessory and full-mask manifests', () => {
    expect(FILTERS.map((filter) => validateFaceFilterManifest(filter).kind))
      .toEqual(['accessory', 'face-mask'])
  })

  it('adds a depth-only face occluder to the glasses', () => {
    const glasses = createBuiltinFilter(GLASSES_FILTER.asset.src)
    expect(glasses.root.getObjectByName('FaceOccluder')).toBeDefined()
    glasses.dispose?.()
  })

  it('drives the full mask jaw from mouthOpen', () => {
    const mask = createBuiltinFilter(ROBOT_MASK_FILTER.asset.src)
    const jaw = mask.root.getObjectByName('Jaw')
    expect(jaw).toBeDefined()
    const closedY = jaw!.position.y
    mask.updateExpressions?.({ mouthOpen: 1 })
    expect(jaw!.position.y).toBeLessThan(closedY)
    mask.dispose?.()
  })

  it('rejects an unknown builtin asset', () => {
    expect(() => createBuiltinFilter('missing')).toThrow(/unknown builtin/)
  })
})
