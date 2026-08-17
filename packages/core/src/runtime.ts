import { applyDeformations } from './deform.js'
import type { MabatakiModel, SpringBinding } from './model.js'
import { validateModel } from './model.js'
import { ParameterStore } from './params.js'

interface PartBuffers {
  base: Float32Array
  output: Float32Array
  springs: SpringState[]
}

interface SpringState {
  binding: SpringBinding
  value: number
  velocity: number
}

export class MabatakiRuntime {
  readonly model: MabatakiModel
  private readonly store: ParameterStore
  private readonly parameterIds: Set<string>
  private readonly buffers = new Map<string, PartBuffers>()
  private readonly hasSprings: boolean
  private dirty = true

  constructor(model: MabatakiModel) {
    this.model = validateModel(model)
    this.store = new ParameterStore(this.model.parameters)
    this.parameterIds = new Set(this.model.parameters.map((parameter) => parameter.id))
    for (const part of this.model.parts) {
      const base = Float32Array.from(part.mesh.vertices)
      const springs = (part.springBindings ?? []).map((binding) => ({
        binding,
        value: this.store.get(binding.parameterId),
        velocity: 0,
      }))
      this.buffers.set(part.id, { base, output: new Float32Array(base.length), springs })
    }
    this.hasSprings = [...this.buffers.values()].some((buffers) => buffers.springs.length > 0)
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

  /**
   * Advances secondary motion in milliseconds. Large gaps are capped so a
   * backgrounded tab cannot inject an unstable simulation step.
   */
  step(deltaMs: number): void {
    if (!Number.isFinite(deltaMs) || deltaMs < 0) {
      throw new Error('spring deltaMs must be a finite non-negative number')
    }
    let remaining = Math.min(deltaMs, 250) / 1000
    if (remaining === 0) return
    if (!this.hasSprings) return
    const maxStep = 1 / 120
    while (remaining > 0) {
      const seconds = Math.min(maxStep, remaining)
      for (const buffers of this.buffers.values()) {
        for (const spring of buffers.springs) {
          const target = this.store.get(spring.binding.parameterId)
          const angularFrequency = 2 * Math.PI * spring.binding.frequencyHz
          const acceleration =
            angularFrequency ** 2 * (target - spring.value) -
            2 * spring.binding.dampingRatio * angularFrequency * spring.velocity
          spring.velocity += acceleration * seconds
          spring.value += spring.velocity * seconds
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
    const requested = this.buffers.get(partId)
    if (requested === undefined) throw new Error(`unknown part "${partId}"`)
    if (this.dirty) {
      const values = this.store.values()
      for (const part of this.model.parts) {
        const buffers = this.buffers.get(part.id)
        if (buffers === undefined) throw new Error(`missing buffers for part "${part.id}"`)
        applyDeformations(buffers.base, part.bindings, values, buffers.output)
        for (const spring of buffers.springs) {
          const lag = spring.value - values[spring.binding.parameterId]
          for (let vertex = 0; vertex < spring.binding.weights.length; vertex++) {
            const influence = lag * spring.binding.weights[vertex]
            buffers.output[vertex * 2] += influence * spring.binding.scaleX
            buffers.output[vertex * 2 + 1] += influence * spring.binding.scaleY
          }
        }
      }
      this.dirty = false
    }
    return requested.output
  }
}
