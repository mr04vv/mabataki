import {
  ACESFilmicToneMapping,
  AmbientLight,
  Color,
  DirectionalLight,
  Mesh,
  Object3D,
  OrthographicCamera,
  Scene,
  SRGBColorSpace,
  WebGLRenderer,
} from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { resolveFaceFilterTransform } from '@mabataki/ar'
import type {
  FaceFilterManifest,
  FaceFilterTrackingFrame,
} from '@mabataki/ar'
import type { Material, Texture } from 'three'

export interface ThreeFaceFilterObject {
  root: Object3D
  updateExpressions?: (expressions: Readonly<Record<string, number>>) => void
  dispose?: () => void
}

function disposeMaterial(material: Material): void {
  const values = Object.values(material) as unknown[]
  for (const value of values) {
    if (value !== null && typeof value === 'object' && 'isTexture' in value) {
      ;(value as Texture).dispose()
    }
  }
  material.dispose()
}

export function disposeObject(root: Object3D): void {
  root.traverse((object) => {
    if (!(object instanceof Mesh)) return
    object.geometry.dispose()
    const materials = Array.isArray(object.material) ? object.material : [object.material]
    for (const material of materials) disposeMaterial(material)
  })
}

export function applyMorphTargetExpressions(
  root: Object3D,
  bindings: Readonly<Record<string, string>>,
  expressions: Readonly<Record<string, number>>,
): void {
  root.traverse((object) => {
    if (!(object instanceof Mesh)) return
    const dictionary = object.morphTargetDictionary
    const influences = object.morphTargetInfluences
    if (dictionary === undefined || influences === undefined) return
    for (const [expression, target] of Object.entries(bindings)) {
      const index = dictionary[target]
      if (index === undefined) continue
      influences[index] = Math.min(1, Math.max(0, expressions[expression] ?? 0))
    }
  })
}

/** Loads a glTF/GLB filter and connects manifest expression bindings to morph targets. */
export async function loadGltfFaceFilter(
  manifest: FaceFilterManifest,
): Promise<ThreeFaceFilterObject> {
  if (manifest.asset.type !== 'gltf') throw new Error('filter asset must be gltf')
  const gltf = await new GLTFLoader().loadAsync(manifest.asset.src)
  const root = gltf.scene
  return {
    root,
    updateExpressions: (expressions) => {
      applyMorphTargetExpressions(root, manifest.expressions ?? {}, expressions)
    },
    dispose: () => disposeObject(root),
  }
}

/** Three.js renderer for face-anchored accessories and full-face masks. */
export class ThreeFaceFilterRenderer {
  private readonly renderer: WebGLRenderer
  private readonly scene = new Scene()
  private readonly camera = new OrthographicCamera(-1, 1, 1, -1, 0.1, 100)
  private manifest: FaceFilterManifest | null = null
  private filter: ThreeFaceFilterObject | null = null
  private viewportAspect = 1

  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new WebGLRenderer({
      canvas,
      alpha: true,
      antialias: true,
      premultipliedAlpha: false,
    })
    this.renderer.setClearColor(new Color(0x000000), 0)
    this.renderer.outputColorSpace = SRGBColorSpace
    this.renderer.toneMapping = ACESFilmicToneMapping
    this.renderer.toneMappingExposure = 1.15
    this.camera.position.z = 10
    this.camera.lookAt(0, 0, 0)
    this.scene.add(new AmbientLight(0xffffff, 1.7))
    const keyLight = new DirectionalLight(0xffffff, 3.2)
    keyLight.position.set(-2, 4, 6)
    this.scene.add(keyLight)
  }

  setFilter(manifest: FaceFilterManifest, filter: ThreeFaceFilterObject): void {
    if (this.filter !== null) {
      this.scene.remove(this.filter.root)
      this.filter.dispose?.()
    }
    this.manifest = manifest
    this.filter = filter
    this.filter.root.visible = false
    this.scene.add(this.filter.root)
  }

  update(frame: FaceFilterTrackingFrame | null): void {
    if (this.manifest === null || this.filter === null) return
    if (frame === null) {
      this.filter.root.visible = false
      return
    }
    const resolved = resolveFaceFilterTransform(this.manifest, frame, this.viewportAspect)
    this.filter.root.visible = true
    this.filter.root.position.set(...resolved.position)
    this.filter.root.rotation.set(...resolved.rotation, 'YXZ')
    this.filter.root.scale.setScalar(resolved.scale)
    this.filter.updateExpressions?.(frame.expressions)
  }

  resize(width: number, height: number, pixelRatio = 1): void {
    if (
      ![width, height, pixelRatio].every(Number.isFinite) ||
      width <= 0 ||
      height <= 0 ||
      pixelRatio <= 0
    ) throw new Error('filter renderer dimensions must be positive')
    this.viewportAspect = width / height
    this.camera.left = -this.viewportAspect
    this.camera.right = this.viewportAspect
    this.camera.top = 1
    this.camera.bottom = -1
    this.camera.updateProjectionMatrix()
    this.renderer.setPixelRatio(Math.min(2, pixelRatio))
    this.renderer.setSize(width, height, false)
  }

  render(): void {
    this.renderer.render(this.scene, this.camera)
  }

  destroy(): void {
    if (this.filter !== null) this.filter.dispose?.()
    this.scene.clear()
    this.renderer.dispose()
    this.filter = null
    this.manifest = null
  }
}
