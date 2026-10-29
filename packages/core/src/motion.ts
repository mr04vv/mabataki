export type MotionInterpolation = 'linear' | 'smoothstep' | 'catmull-rom'
export type MotionBlendMode = 'additive' | 'override'
export type RootMotionProperty =
  | 'translateX'
  | 'translateY'
  | 'rotation'
  | 'scaleX'
  | 'scaleY'

export type MotionTarget =
  | { kind: 'parameter'; id: string }
  | { kind: 'root'; property: RootMotionProperty }

export interface MotionKeyframe {
  /** Milliseconds from the beginning of the clip. */
  timeMs: number
  value: number
}

export interface MotionTrack {
  target: MotionTarget
  keyframes: readonly MotionKeyframe[]
  interpolation?: MotionInterpolation
}

/** A renderer-independent, serializable animation clip. */
export interface MotionClip {
  id: string
  durationMs: number
  loop?: boolean
  tracks: readonly MotionTrack[]
}

export interface MotionLayer {
  clip: MotionClip
  blend?: MotionBlendMode
  weight?: number
  speed?: number
  offsetMs?: number
}

export interface RootMotion {
  /** Model-space translation. Renderers decide how model units map to pixels. */
  translateX: number
  translateY: number
  /** Rotation in radians. */
  rotation: number
  /** Multipliers where 1 is the neutral size. */
  scaleX: number
  scaleY: number
}

export interface MotionFrame {
  parameters: Record<string, number>
  root: RootMotion
}

interface ResolvedMotionLayer {
  blend: MotionBlendMode
  weight: number
  speed: number
  offsetMs: number
}

const ROOT_IDENTITY: RootMotion = {
  translateX: 0,
  translateY: 0,
  rotation: 0,
  scaleX: 1,
  scaleY: 1,
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`invalid motion: ${message}`)
}

function targetKey(target: MotionTarget): string {
  return target.kind === 'parameter'
    ? `parameter:${target.id}`
    : `root:${target.property}`
}

function validateTarget(target: unknown, clipId: string): asserts target is MotionTarget {
  assert(typeof target === 'object' && target !== null, `clip "${clipId}" target must be an object`)
  const raw = target as Record<string, unknown>
  if (raw.kind === 'parameter') {
    assert(
      typeof raw.id === 'string' && raw.id.length > 0,
      `clip "${clipId}" parameter id must be non-empty`,
    )
    return
  }
  assert(raw.kind === 'root', `clip "${clipId}" has an unknown target kind`)
  assert(
    typeof raw.property === 'string' &&
      ['translateX', 'translateY', 'rotation', 'scaleX', 'scaleY'].includes(raw.property),
    `clip "${clipId}" has an unknown root property`,
  )
}

/** Validates untrusted or authored motion data before it reaches the mixer. */
export function validateMotionClip(input: unknown): MotionClip {
  assert(typeof input === 'object' && input !== null, 'clip must be an object')
  const rawClip = input as Record<string, unknown>
  assert(typeof rawClip.id === 'string' && rawClip.id.length > 0, 'clip id must be non-empty')
  const clipId = rawClip.id
  assert(
    Number.isFinite(rawClip.durationMs) && (rawClip.durationMs as number) > 0,
    `clip "${clipId}" durationMs must be positive`,
  )
  const durationMs = rawClip.durationMs as number
  assert(
    rawClip.loop === undefined || typeof rawClip.loop === 'boolean',
    `clip "${clipId}" loop must be boolean`,
  )
  assert(
    Array.isArray(rawClip.tracks) && rawClip.tracks.length > 0,
    `clip "${clipId}" tracks must be non-empty`,
  )

  const targets = new Set<string>()
  for (const inputTrack of rawClip.tracks) {
    assert(typeof inputTrack === 'object' && inputTrack !== null, `clip "${clipId}" track must be an object`)
    const track = inputTrack as Record<string, unknown>
    validateTarget(track.target, clipId)
    const key = targetKey(track.target)
    assert(!targets.has(key), `clip "${clipId}" has duplicate target "${key}"`)
    targets.add(key)
    assert(
      track.interpolation === undefined ||
        track.interpolation === 'linear' ||
        track.interpolation === 'smoothstep' ||
        track.interpolation === 'catmull-rom',
      `clip "${clipId}" has an unknown interpolation`,
    )
    assert(
      Array.isArray(track.keyframes) && track.keyframes.length > 0,
      `clip "${clipId}" keyframes must be non-empty`,
    )

    let previousTime = Number.NEGATIVE_INFINITY
    for (const inputKeyframe of track.keyframes) {
      assert(
        typeof inputKeyframe === 'object' && inputKeyframe !== null,
        `clip "${clipId}" keyframe must be an object`,
      )
      const keyframe = inputKeyframe as Record<string, unknown>
      assert(
        Number.isFinite(keyframe.timeMs) && Number.isFinite(keyframe.value),
        `clip "${clipId}" keyframe values must be finite`,
      )
      const timeMs = keyframe.timeMs as number
      assert(
        timeMs >= 0 && timeMs <= durationMs,
        `clip "${clipId}" keyframe time must be inside its duration`,
      )
      assert(
        timeMs > previousTime,
        `clip "${clipId}" keyframes must be sorted by time`,
      )
      previousTime = timeMs
    }
  }
  return input as MotionClip
}

function clipTime(clip: MotionClip, elapsedMs: number): number {
  if (!clip.loop) return Math.max(0, Math.min(clip.durationMs, elapsedMs))
  return ((elapsedMs % clip.durationMs) + clip.durationMs) % clip.durationMs
}

function interpolate(
  track: MotionTrack,
  timeMs: number,
  loop: boolean,
  durationMs: number,
): number {
  const first = track.keyframes[0]
  if (timeMs <= first.timeMs) return first.value
  const last = track.keyframes[track.keyframes.length - 1]
  if (timeMs >= last.timeMs) return last.value

  for (let index = 1; index < track.keyframes.length; index++) {
    const right = track.keyframes[index]
    if (timeMs > right.timeMs) continue
    const left = track.keyframes[index - 1]
    let progress = (timeMs - left.timeMs) / (right.timeMs - left.timeMs)
    if (track.interpolation === 'smoothstep') {
      progress = progress * progress * (3 - 2 * progress)
    }
    if (track.interpolation === 'catmull-rom') {
      const previous = index >= 2
        ? track.keyframes[index - 2]
        : loop && track.keyframes.length > 2
          ? {
              ...track.keyframes[track.keyframes.length - 2],
              timeMs: track.keyframes[track.keyframes.length - 2].timeMs - durationMs,
            }
          : left
      const next = index + 1 < track.keyframes.length
        ? track.keyframes[index + 1]
        : loop && track.keyframes.length > 2
          ? {
              ...track.keyframes[1],
              timeMs: durationMs + track.keyframes[1].timeMs,
            }
          : right
      const squared = progress * progress
      const cubed = squared * progress
      const segmentMs = right.timeMs - left.timeMs
      const leftSpanMs = right.timeMs - previous.timeMs
      const rightSpanMs = next.timeMs - left.timeMs
      const leftSlope = leftSpanMs === 0 ? 0 : (right.value - previous.value) / leftSpanMs
      const rightSlope = rightSpanMs === 0 ? 0 : (next.value - left.value) / rightSpanMs
      const leftBasis = 2 * cubed - 3 * squared + 1
      const leftSlopeBasis = cubed - 2 * squared + progress
      const rightBasis = -2 * cubed + 3 * squared
      const rightSlopeBasis = cubed - squared
      return leftBasis * left.value +
        leftSlopeBasis * segmentMs * leftSlope +
        rightBasis * right.value +
        rightSlopeBasis * segmentMs * rightSlope
    }
    return left.value + (right.value - left.value) * progress
  }
  return last.value
}

function rootValue(root: RootMotion, property: RootMotionProperty): number {
  return root[property]
}

function blendValue(
  current: number,
  value: number,
  weight: number,
  blend: MotionBlendMode,
): number {
  return blend === 'additive'
    ? current + value * weight
    : current + (value - current) * weight
}

/**
 * Mixes declarative clips into model parameters and a separate root transform.
 * Applications remain responsible for applying the root transform in their renderer.
 */
export class MotionMixer {
  private readonly layers: ResolvedMotionLayer[] = []
  private readonly clips: MotionClip[] = []

  constructor(layers: readonly MotionLayer[]) {
    for (const layer of layers) {
      const clip = validateMotionClip(layer.clip)
      const weight = layer.weight ?? 1
      const speed = layer.speed ?? 1
      const offsetMs = layer.offsetMs ?? 0
      assert(
        layer.blend === undefined || layer.blend === 'additive' || layer.blend === 'override',
        `layer "${clip.id}" has an unknown blend mode`,
      )
      assert(Number.isFinite(weight) && weight >= 0 && weight <= 1, `layer "${clip.id}" weight must be within 0..1`)
      assert(Number.isFinite(speed) && speed >= 0, `layer "${clip.id}" speed must be non-negative`)
      assert(Number.isFinite(offsetMs), `layer "${clip.id}" offsetMs must be finite`)
      this.clips.push(clip)
      this.layers.push({
        blend: layer.blend ?? 'override',
        weight,
        speed,
        offsetMs,
      })
    }
  }

  sample(elapsedMs: number, baseParameters: Record<string, number> = {}): MotionFrame {
    assert(Number.isFinite(elapsedMs), 'elapsedMs must be finite')
    const frame: MotionFrame = {
      parameters: { ...baseParameters },
      root: { ...ROOT_IDENTITY },
    }

    for (let index = 0; index < this.clips.length; index++) {
      const clip = this.clips[index]
      const layer = this.layers[index]
      const timeMs = clipTime(clip, elapsedMs * layer.speed + layer.offsetMs)
      for (const track of clip.tracks) {
        const value = interpolate(track, timeMs, clip.loop ?? false, clip.durationMs)
        if (track.target.kind === 'parameter') {
          const current = frame.parameters[track.target.id] ?? 0
          frame.parameters[track.target.id] = blendValue(
            current,
            value,
            layer.weight,
            layer.blend,
          )
          continue
        }
        const property = track.target.property
        frame.root[property] = blendValue(
          rootValue(frame.root, property),
          value,
          layer.weight,
          layer.blend,
        )
      }
    }
    return frame
  }
}

interface ActiveMotion {
  mixer: MotionMixer
  startedAtMs: number
}

function blendFrames(from: MotionFrame, to: MotionFrame, progress: number): MotionFrame {
  const parameters: Record<string, number> = {}
  const parameterIds = new Set([
    ...Object.keys(from.parameters),
    ...Object.keys(to.parameters),
  ])
  for (const id of parameterIds) {
    const fromValue = from.parameters[id] ?? 0
    const toValue = to.parameters[id] ?? 0
    parameters[id] = fromValue + (toValue - fromValue) * progress
  }
  const root = { ...ROOT_IDENTITY }
  for (const property of Object.keys(root) as RootMotionProperty[]) {
    root[property] = from.root[property] + (to.root[property] - from.root[property]) * progress
  }
  return { parameters, root }
}

/**
 * Owns preset playback time and crossfades without exposing renderer or model
 * concepts. Calling transitionTo during a fade starts from the visible frame.
 */
export class MotionPlayer {
  private active: ActiveMotion
  private transitionFrom: MotionFrame | null = null
  private transitionStartedAtMs = 0
  private transitionDurationMs = 0

  constructor(layers: readonly MotionLayer[], startedAtMs = 0) {
    assert(Number.isFinite(startedAtMs), 'startedAtMs must be finite')
    this.active = { mixer: new MotionMixer(layers), startedAtMs }
  }

  transitionTo(
    layers: readonly MotionLayer[],
    elapsedMs: number,
    durationMs = 450,
    baseParameters: Record<string, number> = {},
  ): void {
    assert(Number.isFinite(elapsedMs), 'elapsedMs must be finite')
    assert(Number.isFinite(durationMs) && durationMs >= 0, 'durationMs must be non-negative')
    const visible = this.sample(elapsedMs, baseParameters)
    this.active = { mixer: new MotionMixer(layers), startedAtMs: elapsedMs }
    this.transitionFrom = durationMs === 0 ? null : visible
    this.transitionStartedAtMs = elapsedMs
    this.transitionDurationMs = durationMs
  }

  sample(elapsedMs: number, baseParameters: Record<string, number> = {}): MotionFrame {
    assert(Number.isFinite(elapsedMs), 'elapsedMs must be finite')
    const target = this.active.mixer.sample(
      Math.max(0, elapsedMs - this.active.startedAtMs),
      baseParameters,
    )
    if (this.transitionFrom === null) {
      return target
    }
    const linearProgress = Math.min(
      1,
      Math.max(0, (elapsedMs - this.transitionStartedAtMs) / this.transitionDurationMs),
    )
    const progress = linearProgress * linearProgress * (3 - 2 * linearProgress)
    const frame = blendFrames(this.transitionFrom, target, progress)
    if (linearProgress === 1) this.transitionFrom = null
    return frame
  }
}
