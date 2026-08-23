import type { ParameterDef } from './model.js'

export type ParameterBlendMode = 'additive' | 'override'

export interface ParameterLayer {
  /** Optional label used in validation errors. */
  id?: string
  values: Readonly<Record<string, number>>
  blend?: ParameterBlendMode
  weight?: number
  /** Restricts this input source to parameters it owns. */
  include?: readonly string[]
}

interface ParameterRange {
  min: number
  max: number
  default: number
}

/**
 * Combines tracker, voice, idle, and manual parameter sources without knowing
 * what produced them. Later override layers take priority; additive layers add
 * a weighted delta. Unknown parameters are ignored and final values are clamped.
 */
export class ParameterComposer {
  private readonly ranges = new Map<string, ParameterRange>()

  constructor(definitions: readonly ParameterDef[]) {
    for (const definition of definitions) {
      if (this.ranges.has(definition.id)) {
        throw new Error(`duplicate parameter "${definition.id}"`)
      }
      if (
        !Number.isFinite(definition.min) ||
        !Number.isFinite(definition.max) ||
        !Number.isFinite(definition.default) ||
        definition.min > definition.default ||
        definition.default > definition.max
      ) {
        throw new Error(`parameter "${definition.id}" must satisfy min <= default <= max`)
      }
      this.ranges.set(definition.id, { ...definition })
    }
  }

  compose(
    layers: readonly ParameterLayer[],
    baseValues: Readonly<Record<string, number>> = {},
  ): Record<string, number> {
    const result = Object.fromEntries(
      [...this.ranges].map(([id, range]) => [id, range.default]),
    )
    this.applyLayer(result, { id: 'base', values: baseValues })
    for (const layer of layers) this.applyLayer(result, layer)
    return result
  }

  private applyLayer(result: Record<string, number>, layer: ParameterLayer): void {
    const blend = layer.blend ?? 'override'
    const weight = layer.weight ?? 1
    const label = layer.id ?? 'unnamed'
    if (blend !== 'additive' && blend !== 'override') {
      throw new Error(`parameter layer "${label}" has an unknown blend mode`)
    }
    if (!Number.isFinite(weight) || weight < 0 || weight > 1) {
      throw new Error(`parameter layer "${label}" weight must be within 0..1`)
    }
    const include = layer.include === undefined ? null : new Set(layer.include)
    for (const [id, value] of Object.entries(layer.values)) {
      if (!Number.isFinite(value)) {
        throw new Error(`parameter layer "${label}" value for "${id}" must be finite`)
      }
      const range = this.ranges.get(id)
      if (range === undefined || (include !== null && !include.has(id))) continue
      const current = result[id]
      const blended = blend === 'additive'
        ? current + value * weight
        : current + (value - current) * weight
      result[id] = Math.min(range.max, Math.max(range.min, blended))
    }
  }
}
