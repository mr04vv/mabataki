import { describe, expect, it } from 'vitest'
import { BoxGeometry, Mesh, MeshBasicMaterial, Object3D } from 'three'
import { applyMorphTargetExpressions } from './index'

describe('applyMorphTargetExpressions', () => {
  it('maps expression values into named morph targets and clamps them', () => {
    const root = new Object3D()
    const mesh = new Mesh(new BoxGeometry(), new MeshBasicMaterial())
    mesh.morphTargetDictionary = { MouthOpen: 0, Blink: 1 }
    mesh.morphTargetInfluences = [0, 0]
    root.add(mesh)

    applyMorphTargetExpressions(
      root,
      { mouthOpen: 'MouthOpen', eyeBlink: 'Blink' },
      { mouthOpen: 1.4, eyeBlink: -0.2 },
    )

    expect(mesh.morphTargetInfluences).toEqual([1, 0])
  })
})
