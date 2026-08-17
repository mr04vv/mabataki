import type { Binding, Keyframe } from './model.js'

function addScaled(out: Float32Array, deltas: number[], scale: number): void {
  if (scale === 0) return
  for (let i = 0; i < deltas.length; i++) out[i] += deltas[i] * scale
}

/**
 * Samples a keyframe list piecewise-linearly at `value` and accumulates the
 * resulting deltas into `out`. Values outside the keyframe range are clamped
 * to the first/last keyframe. `keyframes` must be sorted ascending by value.
 */
export function accumulateBinding(keyframes: Keyframe[], value: number, out: Float32Array): void {
  const first = keyframes[0]
  if (first === undefined) return
  const last = keyframes[keyframes.length - 1]
  if (value <= first.value) {
    addScaled(out, first.deltas, 1)
    return
  }
  if (value >= last.value) {
    addScaled(out, last.deltas, 1)
    return
  }
  for (let k = 1; k < keyframes.length; k++) {
    const hi = keyframes[k]
    if (value > hi.value) continue
    const lo = keyframes[k - 1]
    const t = (value - lo.value) / (hi.value - lo.value)
    addScaled(out, lo.deltas, 1 - t)
    addScaled(out, hi.deltas, t)
    return
  }
}

/**
 * Computes `base + Σ sample(binding, values[binding.parameterId])` for every
 * binding. Pass `out` to reuse a buffer and avoid per-frame allocation.
 */
export function applyDeformations(
  base: ArrayLike<number>,
  bindings: Binding[],
  values: Record<string, number>,
  out?: Float32Array,
): Float32Array {
  const result = out ?? new Float32Array(base.length)
  if (result.length !== base.length) {
    throw new Error('output buffer length must match base length')
  }
  result.set(base)
  for (const binding of bindings) {
    const value = values[binding.parameterId]
    if (value === undefined) {
      throw new Error(`missing value for parameter "${binding.parameterId}"`)
    }
    accumulateBinding(binding.keyframes, value, result)
  }
  return result
}
