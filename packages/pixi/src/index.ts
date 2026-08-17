import { Container, Mesh, MeshGeometry } from 'pixi.js'
import type { Texture } from 'pixi.js'
import type { MabatakiRuntime } from '@mabataki/core'

interface RenderedPart {
  geometry: MeshGeometry
  mesh: Mesh
}

/** Renders the reusable vertex buffers produced by MabatakiRuntime with PixiJS. */
export class PixiAvatarRenderer {
  readonly container = new Container()
  private readonly parts: RenderedPart[]

  constructor(
    private readonly runtime: MabatakiRuntime,
    textures: readonly Texture[],
  ) {
    if (textures.length !== runtime.model.parts.length) {
      throw new Error('texture count must match model part count')
    }
    this.parts = runtime.model.parts.map((part, index) => {
      const geometry = new MeshGeometry({
        positions: runtime.getPartVertices(part.id).slice(),
        uvs: Float32Array.from(part.mesh.uvs),
        indices: Uint32Array.from(part.mesh.indices),
      })
      const mesh = new Mesh({ geometry, texture: textures[index] })
      this.container.addChild(mesh)
      return { geometry, mesh }
    })
  }

  render(): void {
    for (let index = 0; index < this.runtime.model.parts.length; index++) {
      const positions = this.runtime.getPartVertices(this.runtime.model.parts[index].id)
      const buffer = this.parts[index].geometry.getBuffer('aPosition')
      ;(buffer.data as Float32Array).set(positions)
      buffer.update()
    }
  }

  destroy(): void {
    for (const part of this.parts) {
      part.mesh.destroy()
      part.geometry.destroy()
    }
    this.container.removeChildren()
    this.container.destroy()
  }
}
