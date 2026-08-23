import type {
  Part,
  PartTransform,
  PartTransformDelta,
  PartTransformKeyframe,
} from './model.js'

const IDENTITY: PartTransform = {
  x: 0,
  y: 0,
  rotation: 0,
  scaleX: 1,
  scaleY: 1,
  pivotX: 0,
  pivotY: 0,
}

function deltaValue(delta: PartTransformDelta, property: keyof PartTransformDelta): number {
  return delta[property] ?? 0
}

function interpolateDelta(
  left: PartTransformKeyframe,
  right: PartTransformKeyframe,
  progress: number,
): PartTransformDelta {
  return {
    x: deltaValue(left.transform, 'x') +
      (deltaValue(right.transform, 'x') - deltaValue(left.transform, 'x')) * progress,
    y: deltaValue(left.transform, 'y') +
      (deltaValue(right.transform, 'y') - deltaValue(left.transform, 'y')) * progress,
    rotation: deltaValue(left.transform, 'rotation') +
      (deltaValue(right.transform, 'rotation') - deltaValue(left.transform, 'rotation')) * progress,
    scaleX: deltaValue(left.transform, 'scaleX') +
      (deltaValue(right.transform, 'scaleX') - deltaValue(left.transform, 'scaleX')) * progress,
    scaleY: deltaValue(left.transform, 'scaleY') +
      (deltaValue(right.transform, 'scaleY') - deltaValue(left.transform, 'scaleY')) * progress,
  }
}

function sampleKeyframes(keyframes: readonly PartTransformKeyframe[], value: number): PartTransformDelta {
  const first = keyframes[0]
  const last = keyframes[keyframes.length - 1]
  if (value <= first.value) return first.transform
  if (value >= last.value) return last.transform
  for (let index = 1; index < keyframes.length; index++) {
    const right = keyframes[index]
    if (value > right.value) continue
    const left = keyframes[index - 1]
    return interpolateDelta(left, right, (value - left.value) / (right.value - left.value))
  }
  return last.transform
}

/** Resolves a part's neutral transform plus additive parameter key poses. */
export function resolvePartTransform(
  part: Part,
  values: Readonly<Record<string, number>>,
): PartTransform {
  const result: PartTransform = { ...IDENTITY, ...part.transform }
  for (const binding of part.transformBindings ?? []) {
    const value = values[binding.parameterId]
    if (value === undefined) {
      throw new Error(`missing value for parameter "${binding.parameterId}"`)
    }
    const delta = sampleKeyframes(binding.keyframes, value)
    result.x += delta.x ?? 0
    result.y += delta.y ?? 0
    result.rotation += delta.rotation ?? 0
    result.scaleX += delta.scaleX ?? 0
    result.scaleY += delta.scaleY ?? 0
  }
  return result
}
