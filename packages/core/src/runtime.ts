import { applyDeformations } from './deform.js'
import type {
  MabatakiModel,
  Part,
  PartTransform,
  SpringBinding,
  TransformSpringBinding,
} from './model.js'
import { validateModel } from './model.js'
import { resolvePartTransform } from './part-transform.js'
import { ParameterStore } from './params.js'

interface SpringState {
  binding: SpringBinding
  value: number
  velocity: number
}

interface TransformSpringState {
  binding: TransformSpringBinding
  value: number
  velocity: number
}

interface PartBuffers {
  base: Float32Array
  output: Float32Array
  transform: PartTransform
  springs: SpringState[]
  transformSprings: TransformSpringState[]
}

export interface PhysicsRootMotion {
  translateX: number
  translateY: number
  rotation: number
}

export interface PartPose {
  /** Reused runtime buffer. Treat as read-only and copy before retaining. */
  vertices: Float32Array
  /** Detached local transform relative to parentId or the avatar root. */
  transform: PartTransform
  parentId?: string
  maskId?: string
}

const ROOT_IDENTITY: PhysicsRootMotion = {
  translateX: 0,
  translateY: 0,
  rotation: 0,
}

function integrateSpring(
  spring: { value: number; velocity: number },
  target: number,
  frequencyHz: number,
  dampingRatio: number,
  seconds: number,
): void {
  const angularFrequency = 2 * Math.PI * frequencyHz
  const acceleration =
    angularFrequency ** 2 * (target - spring.value) -
    2 * dampingRatio * angularFrequency * spring.velocity
  spring.velocity += acceleration * seconds
  spring.value += spring.velocity * seconds
}

export class MabatakiRuntime {
  readonly model: MabatakiModel
  private readonly store: ParameterStore
  private readonly parameterIds: Set<string>
  private readonly partsById = new Map<string, Part>()
  private readonly buffers = new Map<string, PartBuffers>()
  private readonly hasSprings: boolean
  private rootMotion: PhysicsRootMotion = { ...ROOT_IDENTITY }
  private dirty = true

  constructor(model: MabatakiModel) {
    this.model = validateModel(model)
    this.store = new ParameterStore(this.model.parameters)
    this.parameterIds = new Set(this.model.parameters.map((parameter) => parameter.id))
    for (const part of this.model.parts) {
      this.partsById.set(part.id, part)
      const base = Float32Array.from(part.mesh.vertices)
      const springs = (part.springBindings ?? []).map((binding) => ({
        binding,
        value: this.store.get(binding.parameterId),
        velocity: 0,
      }))
      const transformSprings = (part.transformSpringBindings ?? []).map((binding) => ({
        binding,
        value: 0,
        velocity: 0,
      }))
      this.buffers.set(part.id, {
        base,
        output: new Float32Array(base.length),
        transform: resolvePartTransform(part, this.store.values()),
        springs,
        transformSprings,
      })
    }
    this.hasSprings = [...this.buffers.values()].some((buffers) =>
      buffers.springs.length > 0 || buffers.transformSprings.length > 0,
    )
    this.resetPhysics()
  }

  update(values: Record<string, number>): void {
    let changed = false
    for (const [id, value] of Object.entries(values)) {
      if (!Number.isFinite(value)) throw new Error(`parameter "${id}" value must be finite`)
      if (!this.parameterIds.has(id)) continue
      this.store.set(id, value)
      changed = true
    }
    if (changed) this.dirty = true
  }

  getParameter(id: string): number {
    return this.store.get(id)
  }

  /** Returns a detached snapshot of every declared parameter. */
  getParameters(): Record<string, number> {
    return this.store.values()
  }

  /** Restores parameter defaults and clears all secondary-motion velocity. */
  reset(): void {
    this.store.reset()
    this.rootMotion = { ...ROOT_IDENTITY }
    this.resetPhysics()
    this.dirty = true
  }

  /** Snaps spring state to the current inputs without changing parameters. */
  resetPhysics(rootMotion: Partial<PhysicsRootMotion> = {}): void {
    this.setRootMotion(rootMotion)
    for (const buffers of this.buffers.values()) {
      for (const spring of buffers.springs) {
        spring.value = this.store.get(spring.binding.parameterId)
        spring.velocity = 0
      }
      for (const spring of buffers.transformSprings) {
        spring.value = 0
        spring.velocity = 0
      }
    }
    const values = this.store.values()
    const transforms = this.calculateTransforms(values, false)
    for (const part of this.model.parts) {
      const buffers = this.requireBuffers(part.id)
      for (const spring of buffers.transformSprings) {
        spring.value = this.transformSpringTarget(part, spring.binding, transforms, values)
      }
    }
    this.dirty = true
  }

  /**
   * Advances secondary motion in milliseconds. Supplying root motion lets
   * attached parts react to whole-avatar movement without Core applying it.
   */
  step(deltaMs: number, rootMotion: Partial<PhysicsRootMotion> = {}): void {
    if (!Number.isFinite(deltaMs) || deltaMs < 0) {
      throw new Error('spring deltaMs must be a finite non-negative number')
    }
    this.setRootMotion(rootMotion)
    let remaining = Math.min(deltaMs, 250) / 1000
    if (!this.hasSprings) return
    if (remaining === 0) {
      this.dirty = true
      return
    }
    const maxStep = 1 / 120
    while (remaining > 0) {
      const seconds = Math.min(maxStep, remaining)
      const values = this.store.values()
      const transforms = this.calculateTransforms(values, true)
      for (const part of this.model.parts) {
        const buffers = this.requireBuffers(part.id)
        for (const spring of buffers.springs) {
          integrateSpring(
            spring,
            this.store.get(spring.binding.parameterId),
            spring.binding.frequencyHz,
            spring.binding.dampingRatio,
            seconds,
          )
        }
        for (const spring of buffers.transformSprings) {
          integrateSpring(
            spring,
            this.transformSpringTarget(part, spring.binding, transforms, values),
            spring.binding.frequencyHz,
            spring.binding.dampingRatio,
            seconds,
          )
        }
      }
      remaining -= seconds
    }
    this.dirty = true
  }

  /**
   * Returns a reused, read-only-by-convention vertex buffer. Copy it before
   * retaining a snapshot or modifying its contents.
   */
  getPartVertices(partId: string): Float32Array {
    this.recompute()
    return this.requireBuffers(partId).output
  }

  /** Returns the resolved local transform for an attached rigid part. */
  getPartTransform(partId: string): PartTransform {
    this.recompute()
    return { ...this.requireBuffers(partId).transform }
  }

  /** Returns both renderer inputs while preserving hierarchy and mask metadata. */
  getPartPose(partId: string): PartPose {
    const part = this.partsById.get(partId)
    if (part === undefined) throw new Error(`unknown part "${partId}"`)
    return {
      vertices: this.getPartVertices(partId),
      transform: this.getPartTransform(partId),
      ...(part.parentId === undefined ? {} : { parentId: part.parentId }),
      ...(part.maskId === undefined ? {} : { maskId: part.maskId }),
    }
  }

  private setRootMotion(rootMotion: Partial<PhysicsRootMotion>): void {
    for (const property of ['translateX', 'translateY', 'rotation'] as const) {
      const value = rootMotion[property]
      if (value === undefined) continue
      if (!Number.isFinite(value)) throw new Error(`root motion ${property} must be finite`)
      this.rootMotion[property] = value
    }
  }

  private requireBuffers(partId: string): PartBuffers {
    const buffers = this.buffers.get(partId)
    if (buffers === undefined) throw new Error(`unknown part "${partId}"`)
    return buffers
  }

  private transformSpringTarget(
    part: Part,
    binding: TransformSpringBinding,
    transforms: ReadonlyMap<string, PartTransform>,
    values: Readonly<Record<string, number>>,
  ): number {
    if (binding.source.kind === 'parameter') return values[binding.source.id]
    if (binding.source.kind === 'root') return this.rootMotion[binding.source.property]
    if (part.parentId === undefined) throw new Error(`part "${part.id}" has no parent`)
    const parent = transforms.get(part.parentId)
    if (parent === undefined) throw new Error(`missing transform for parent "${part.parentId}"`)
    return parent[binding.source.property]
  }

  private calculateTransforms(
    values: Readonly<Record<string, number>>,
    includeSprings: boolean,
  ): Map<string, PartTransform> {
    const transforms = new Map<string, PartTransform>()
    const resolve = (part: Part): PartTransform => {
      const cached = transforms.get(part.id)
      if (cached !== undefined) return cached
      if (part.parentId !== undefined) {
        const parent = this.partsById.get(part.parentId)
        if (parent === undefined) throw new Error(`unknown parent "${part.parentId}"`)
        resolve(parent)
      }
      const transform = resolvePartTransform(part, values)
      transforms.set(part.id, transform)
      if (!includeSprings) return transform
      const buffers = this.requireBuffers(part.id)
      for (const spring of buffers.transformSprings) {
        const target = this.transformSpringTarget(part, spring.binding, transforms, values)
        transform[spring.binding.property] += (spring.value - target) * spring.binding.scale
      }
      return transform
    }
    for (const part of this.model.parts) resolve(part)
    return transforms
  }

  private recompute(): void {
    if (!this.dirty) return
    const values = this.store.values()
    const transforms = this.calculateTransforms(values, true)
    for (const part of this.model.parts) {
      const buffers = this.requireBuffers(part.id)
      applyDeformations(buffers.base, part.bindings, values, buffers.output)
      for (const spring of buffers.springs) {
        const lag = spring.value - values[spring.binding.parameterId]
        for (let vertex = 0; vertex < spring.binding.weights.length; vertex++) {
          const influence = lag * spring.binding.weights[vertex]
          buffers.output[vertex * 2] += influence * spring.binding.scaleX
          buffers.output[vertex * 2 + 1] += influence * spring.binding.scaleY
        }
      }
      buffers.transform = transforms.get(part.id) ?? resolvePartTransform(part, values)
    }
    this.dirty = false
  }
}
