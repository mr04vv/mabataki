import { Container, Mesh, MeshGeometry } from 'pixi.js'
import type { Texture } from 'pixi.js'
import type { MabatakiRuntime, PartTransform } from '@mabataki/core'

interface RenderedPart {
  container: Container
  geometry: MeshGeometry
  mesh: Mesh
}

function applyTransform(container: Container, transform: PartTransform): void {
  container.position.set(transform.x, transform.y)
  container.pivot.set(transform.pivotX, transform.pivotY)
  container.rotation = transform.rotation
  container.scale.set(transform.scaleX, transform.scaleY)
}

/** Renders Core vertex buffers, rigid part hierarchy, and clip masks with PixiJS. */
export class PixiAvatarRenderer {
  readonly container = new Container()
  private readonly parts: RenderedPart[]
  private readonly partsById = new Map<string, RenderedPart>()

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
      const container = new Container()
      container.addChild(mesh)
      applyTransform(container, runtime.getPartTransform(part.id))
      const rendered = { container, geometry, mesh }
      this.partsById.set(part.id, rendered)
      return rendered
    })

    for (const part of runtime.model.parts) {
      const rendered = this.requirePart(part.id)
      if (part.parentId === undefined) {
        this.container.addChild(rendered.container)
      } else {
        this.requirePart(part.parentId).container.addChild(rendered.container)
      }
    }
    for (const part of runtime.model.parts) {
      if (part.maskId === undefined) continue
      this.requirePart(part.id).container.mask = this.requirePart(part.maskId).mesh
    }
  }

  render(): void {
    for (let index = 0; index < this.runtime.model.parts.length; index++) {
      const part = this.runtime.model.parts[index]
      const rendered = this.parts[index]
      const positions = this.runtime.getPartVertices(part.id)
      const buffer = rendered.geometry.getBuffer('aPosition')
      ;(buffer.data as Float32Array).set(positions)
      buffer.update()
      applyTransform(rendered.container, this.runtime.getPartTransform(part.id))
    }
  }

  destroy(): void {
    for (const part of [...this.parts].reverse()) {
      part.mesh.destroy()
      part.geometry.destroy()
      part.container.removeChildren()
      part.container.destroy()
    }
    this.container.removeChildren()
    this.container.destroy()
  }

  private requirePart(partId: string): RenderedPart {
    const part = this.partsById.get(partId)
    if (part === undefined) throw new Error(`missing rendered part "${partId}"`)
    return part
  }
}
