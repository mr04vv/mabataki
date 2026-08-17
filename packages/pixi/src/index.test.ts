import { describe, expect, it } from 'vitest'
import { Texture } from 'pixi.js'
import { MabatakiRuntime } from '@mabataki/core'
import type { MabatakiModel } from '@mabataki/core'
import { PixiAvatarRenderer } from './index'

const model: MabatakiModel = {
  version: 1,
  parameters: [{ id: 'mouthOpen', min: 0, max: 1, default: 0 }],
  parts: [{
    id: 'mouth',
    texture: 'mouth.png',
    mesh: {
      vertices: [0, 0, 10, 0, 0, 10],
      uvs: [0, 0, 1, 0, 0, 1],
      indices: [0, 1, 2],
    },
    bindings: [{
      parameterId: 'mouthOpen',
      keyframes: [
        { value: 0, deltas: [0, 0, 0, 0, 0, 0] },
        { value: 1, deltas: [0, 5, 0, 5, 0, 5] },
      ],
    }],
  }],
}

describe('PixiAvatarRenderer', () => {
  it('creates one mesh per model part and refreshes runtime vertices', () => {
    const runtime = new MabatakiRuntime(model)
    const renderer = new PixiAvatarRenderer(runtime, [Texture.EMPTY])
    expect(renderer.container.children).toHaveLength(1)

    runtime.update({ mouthOpen: 1 })
    renderer.render()
    expect(runtime.getPartVertices('mouth')[1]).toBe(5)
    renderer.destroy()
  })

  it('rejects a texture count that does not match the model', () => {
    expect(() => new PixiAvatarRenderer(new MabatakiRuntime(model), [])).toThrow(/texture count/)
  })
})
