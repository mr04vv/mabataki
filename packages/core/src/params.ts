import type { ParameterDef } from './model.js'

/**
 * Holds current parameter values, clamped to their declared ranges.
 * This is the runtime-facing boundary: trackers/UI write here, the
 * deformation code reads a snapshot via `values()`.
 */
export class ParameterStore {
  private readonly defs = new Map<string, ParameterDef>()
  private readonly current = new Map<string, number>()

  constructor(definitions: ParameterDef[]) {
    for (const def of definitions) {
      if (this.defs.has(def.id)) throw new Error(`duplicate parameter "${def.id}"`)
      if (!Number.isFinite(def.min) || !Number.isFinite(def.max) || !Number.isFinite(def.default)) {
        throw new Error(`parameter "${def.id}" range must be finite`)
      }
      if (def.min > def.max || def.default < def.min || def.default > def.max) {
        throw new Error(`parameter "${def.id}" must satisfy min <= default <= max`)
      }
      this.defs.set(def.id, def)
      this.current.set(def.id, def.default)
    }
  }

  set(id: string, value: number): void {
    const def = this.defs.get(id)
    if (def === undefined) throw new Error(`unknown parameter "${id}"`)
    if (!Number.isFinite(value)) throw new Error(`parameter "${id}" value must be finite`)
    this.current.set(id, Math.min(def.max, Math.max(def.min, value)))
  }

  get(id: string): number {
    const value = this.current.get(id)
    if (value === undefined) throw new Error(`unknown parameter "${id}"`)
    return value
  }

  values(): Record<string, number> {
    return Object.fromEntries(this.current)
  }
}
