import type {
  MotionLayer,
  MotionTarget,
  MotionTrack,
} from './motion.js'

export interface MotionPlaybackOptions {
  /** Layer influence in 0..1. */
  weight?: number
  /** Playback multiplier. Zero pauses the generated motion. */
  speed?: number
  /** Timeline phase offset in milliseconds. */
  offsetMs?: number
  blinkIntervalMs?: number
  blinkDurationMs?: number
}

export interface GroundedMotionOptions extends MotionPlaybackOptions {
  periodMs?: number
  headYaw?: number
  headRoll?: number
}

export type FloatingMotionStyle = 'hover' | 'balloon' | 'ghost'

export interface FloatingMotionOptions extends MotionPlaybackOptions {
  /** Named defaults. Every numeric option below can override the selected style. */
  style?: FloatingMotionStyle
  /** Horizontal model-space distance from neutral. */
  amplitudeX?: number
  /** Upward model-space distance; downward travel uses 65% of this value. */
  amplitudeY?: number
  /** Base period. Axis-specific periods override the derived values below. */
  periodMs?: number
  periodXMs?: number
  periodYMs?: number
  rotationPeriodMs?: number
  breathingPeriodMs?: number
  headPeriodMs?: number
  /** Deterministic timing/amplitude variation in 0..0.5. */
  variation?: number
  /** Seed used to generate repeatable variation. */
  seed?: number
  /** Number of base cycles before the generated clip repeats. */
  cycleCount?: number
  rotation?: number
  breathing?: number
  headYaw?: number
  headRoll?: number
}

interface FloatingStyleDefaults {
  amplitudeX: number
  amplitudeY: number
  periodXMs: number
  periodYMs: number
  rotationPeriodMs: number
  breathingPeriodMs: number
  headPeriodMs: number
  rotation: number
  breathing: number
  headYaw: number
  headRoll: number
  variation: number
  seed: number
  blinkIntervalMs: number
  offsetMs: number
}

const FLOATING_STYLE_DEFAULTS: Record<FloatingMotionStyle, FloatingStyleDefaults> = {
  hover: {
    amplitudeX: 4,
    amplitudeY: 18,
    periodXMs: 7300,
    periodYMs: 4800,
    rotationPeriodMs: 6200,
    breathingPeriodMs: 3700,
    headPeriodMs: 5600,
    rotation: 0.009,
    breathing: 0.006,
    headYaw: 0.04,
    headRoll: 0.012,
    variation: 0.1,
    seed: 104729,
    blinkIntervalMs: 4600,
    offsetMs: 0,
  },
  balloon: {
    amplitudeX: 14,
    amplitudeY: 26,
    periodXMs: 9800,
    periodYMs: 6500,
    rotationPeriodMs: 8800,
    breathingPeriodMs: 5200,
    headPeriodMs: 7600,
    rotation: 0.022,
    breathing: 0.012,
    headYaw: 0.03,
    headRoll: 0.025,
    variation: 0.16,
    seed: 130363,
    blinkIntervalMs: 5200,
    offsetMs: 0,
  },
  ghost: {
    amplitudeX: 10,
    amplitudeY: 20,
    periodXMs: 5300,
    periodYMs: 3500,
    rotationPeriodMs: 4100,
    breathingPeriodMs: 2700,
    headPeriodMs: 4600,
    rotation: 0.028,
    breathing: 0.004,
    headYaw: 0.08,
    headRoll: 0.035,
    variation: 0.22,
    seed: 155921,
    blinkIntervalMs: 3600,
    offsetMs: 430,
  },
}

export interface LivelyMotionOptions extends MotionPlaybackOptions {
  amplitudeX?: number
  amplitudeY?: number
  periodMs?: number
  rotation?: number
  squash?: number
  headYaw?: number
  headRoll?: number
}

function finite(name: string, value: number): number {
  if (!Number.isFinite(value)) throw new Error(`motion preset ${name} must be finite`)
  return value
}

function nonNegative(name: string, value: number): number {
  finite(name, value)
  if (value < 0) throw new Error(`motion preset ${name} must be non-negative`)
  return value
}

function positive(name: string, value: number): number {
  finite(name, value)
  if (value <= 0) throw new Error(`motion preset ${name} must be positive`)
  return value
}

function playback(options: MotionPlaybackOptions): Pick<
  MotionLayer,
  'weight' | 'speed' | 'offsetMs'
> {
  const weight = options.weight ?? 1
  const speed = options.speed ?? 1
  const offsetMs = options.offsetMs ?? 0
  if (weight < 0 || weight > 1 || !Number.isFinite(weight)) {
    throw new Error('motion preset weight must be within 0..1')
  }
  nonNegative('speed', speed)
  finite('offsetMs', offsetMs)
  return { weight, speed, offsetMs }
}

function cycleTrack(
  target: MotionTarget,
  durationMs: number,
  values: readonly number[],
): MotionTrack {
  return {
    target,
    interpolation: 'catmull-rom',
    keyframes: values.map((value, index) => ({
      timeMs: durationMs * index / (values.length - 1),
      value,
    })),
  }
}

interface GeneratedTrack {
  durationMs: number
  track: MotionTrack
}

function seededRandom(seed: number): () => number {
  let state = Math.trunc(seed) >>> 0
  return () => {
    state += 0x6D2B79F5
    let value = state
    value = Math.imul(value ^ value >>> 15, value | 1)
    value ^= value + Math.imul(value ^ value >>> 7, value | 61)
    return ((value ^ value >>> 14) >>> 0) / 4294967296
  }
}

function organicCycleTrack(
  target: MotionTarget,
  periodMs: number,
  values: readonly number[],
  variation: number,
  seed: number,
  cycleCount: number,
): GeneratedTrack {
  const random = seededRandom(seed)
  const segmentMs = periodMs / (values.length - 1)
  const keyframes = [{ timeMs: 0, value: values[0] }]
  let timeMs = 0
  for (let cycle = 0; cycle < cycleCount; cycle++) {
    for (let segment = 1; segment < values.length; segment++) {
      const variedCycle = cycle > 0
      const timingScale = variedCycle
        ? 1 + (random() * 2 - 1) * variation * 0.55
        : 1
      timeMs += segmentMs * timingScale
      const baseValue = values[segment]
      const isFinal = cycle === cycleCount - 1 && segment === values.length - 1
      const amplitudeScale = variedCycle && !isFinal
        ? 1 + (random() * 2 - 1) * variation
        : 1
      keyframes.push({ timeMs, value: baseValue * amplitudeScale })
    }
  }
  return {
    durationMs: timeMs,
    track: {
      target,
      interpolation: 'catmull-rom',
      keyframes,
    },
  }
}

function blinkLayer(
  id: string,
  options: MotionPlaybackOptions,
  defaultIntervalMs: number,
  variation = 0,
  seed = 0,
  cycleCount = 1,
): MotionLayer {
  const intervalMs = positive('blinkIntervalMs', options.blinkIntervalMs ?? defaultIntervalMs)
  const durationMs = positive('blinkDurationMs', options.blinkDurationMs ?? 170)
  if (intervalMs <= durationMs + 600) {
    throw new Error('motion preset blinkIntervalMs must exceed blinkDurationMs by 600ms')
  }
  const random = seededRandom(seed)
  const blinkTimes: Array<{ startMs: number; middleMs: number; endMs: number }> = []
  let clipDurationMs = 0
  for (let cycle = 0; cycle < cycleCount; cycle++) {
    const variedInterval = cycle === 0
      ? intervalMs
      : intervalMs * (1 + (random() * 2 - 1) * variation)
    if (variedInterval <= durationMs + 600) {
      throw new Error('motion preset varied blink interval is too short')
    }
    const startMs = clipDurationMs + variedInterval - durationMs - 600
    blinkTimes.push({
      startMs,
      middleMs: startMs + durationMs / 2,
      endMs: startMs + durationMs,
    })
    clipDurationMs += variedInterval
  }
  const eyeTrack = (id: string): MotionTrack => ({
    target: { kind: 'parameter', id },
    interpolation: 'smoothstep',
    keyframes: [
      { timeMs: 0, value: 1 },
      ...blinkTimes.flatMap(({ startMs, middleMs, endMs }) => [
        { timeMs: startMs, value: 1 },
        { timeMs: middleMs, value: 0 },
        { timeMs: endMs, value: 1 },
      ]),
      { timeMs: clipDurationMs, value: 1 },
    ],
  })
  return {
    blend: 'override',
    ...playback(options),
    clip: {
      id: `${id}-blink`,
      durationMs: clipDurationMs,
      loop: true,
      tracks: [eyeTrack('eyeOpenLeft'), eyeTrack('eyeOpenRight')],
    },
  }
}

/** Restrained idle motion for characters whose body must remain planted. */
export function createGroundedMotion(options: GroundedMotionOptions = {}): MotionLayer[] {
  const periodMs = positive('periodMs', options.periodMs ?? 7200)
  const headYaw = nonNegative('headYaw', options.headYaw ?? 0.04)
  const headRoll = nonNegative('headRoll', options.headRoll ?? 0.012)
  return [
    {
      blend: 'additive',
      ...playback(options),
      clip: {
        id: 'grounded-sway',
        durationMs: periodMs,
        loop: true,
        tracks: [
          cycleTrack(
            { kind: 'parameter', id: 'headYaw' },
            periodMs,
            [0, headYaw, 0, -headYaw, 0],
          ),
          cycleTrack(
            { kind: 'parameter', id: 'headRoll' },
            periodMs,
            [headRoll * 0.8, -headRoll, headRoll * 0.8],
          ),
        ],
      },
    },
    blinkLayer('grounded', options, 4600),
  ]
}

/** Configurable whole-avatar drift plus subtle expression motion. */
export function createFloatingMotion(options: FloatingMotionOptions = {}): MotionLayer[] {
  const style = options.style ?? 'hover'
  if (!Object.hasOwn(FLOATING_STYLE_DEFAULTS, style)) {
    throw new Error(`motion preset style is unknown: ${style}`)
  }
  const defaults = FLOATING_STYLE_DEFAULTS[style]
  const periodScale = options.periodMs === undefined
    ? 1
    : positive('periodMs', options.periodMs) / defaults.periodYMs
  const amplitudeX = nonNegative('amplitudeX', options.amplitudeX ?? defaults.amplitudeX)
  const amplitudeY = nonNegative('amplitudeY', options.amplitudeY ?? defaults.amplitudeY)
  const periodXMs = positive(
    'periodXMs',
    options.periodXMs ?? defaults.periodXMs * periodScale,
  )
  const periodYMs = positive(
    'periodYMs',
    options.periodYMs ?? defaults.periodYMs * periodScale,
  )
  const rotationPeriodMs = positive(
    'rotationPeriodMs',
    options.rotationPeriodMs ?? defaults.rotationPeriodMs * periodScale,
  )
  const breathingPeriodMs = positive(
    'breathingPeriodMs',
    options.breathingPeriodMs ?? defaults.breathingPeriodMs * periodScale,
  )
  const headPeriodMs = positive(
    'headPeriodMs',
    options.headPeriodMs ?? defaults.headPeriodMs * periodScale,
  )
  const rotation = nonNegative('rotation', options.rotation ?? defaults.rotation)
  const breathing = nonNegative('breathing', options.breathing ?? defaults.breathing)
  const headYaw = nonNegative('headYaw', options.headYaw ?? defaults.headYaw)
  const headRoll = nonNegative('headRoll', options.headRoll ?? defaults.headRoll)
  const variation = finite('variation', options.variation ?? defaults.variation)
  if (variation < 0 || variation > 0.5) {
    throw new Error('motion preset variation must be within 0..0.5')
  }
  const seed = finite('seed', options.seed ?? defaults.seed)
  const cycleCount = options.cycleCount ?? 4
  if (!Number.isInteger(cycleCount) || cycleCount < 1 || cycleCount > 16) {
    throw new Error('motion preset cycleCount must be an integer within 1..16')
  }
  const resolvedPlayback: MotionPlaybackOptions = {
    ...options,
    offsetMs: options.offsetMs ?? defaults.offsetMs,
    blinkIntervalMs: options.blinkIntervalMs ?? defaults.blinkIntervalMs,
  }
  const horizontal = organicCycleTrack(
    { kind: 'root', property: 'translateX' },
    periodXMs,
    [amplitudeX, 0, -amplitudeX, 0, amplitudeX],
    variation,
    seed + 1,
    cycleCount,
  )
  const vertical = organicCycleTrack(
    { kind: 'root', property: 'translateY' },
    periodYMs,
    [0, -amplitudeY, 0, amplitudeY * 0.65, 0],
    variation,
    seed + 2,
    cycleCount,
  )
  const rotationTrack = organicCycleTrack(
    { kind: 'root', property: 'rotation' },
    rotationPeriodMs,
    [0, rotation, 0, -rotation, 0],
    variation,
    seed + 3,
    cycleCount,
  )
  const breathingTrack = organicCycleTrack(
    { kind: 'root', property: 'scaleY' },
    breathingPeriodMs,
    [0, breathing, 0, -breathing * 0.5, 0],
    variation * 0.6,
    seed + 4,
    cycleCount,
  )
  const yawTrack = organicCycleTrack(
    { kind: 'parameter', id: 'headYaw' },
    headPeriodMs,
    [-headYaw, headYaw, -headYaw],
    variation,
    seed + 5,
    cycleCount,
  )
  const rollTrack = organicCycleTrack(
    { kind: 'parameter', id: 'headRoll' },
    headPeriodMs * 1.17,
    [headRoll, -headRoll, headRoll],
    variation,
    seed + 6,
    cycleCount,
  )
  return [
    {
      blend: 'additive',
      ...playback(resolvedPlayback),
      clip: {
        id: `${style}-horizontal`,
        durationMs: horizontal.durationMs,
        loop: true,
        tracks: [horizontal.track],
      },
    },
    {
      blend: 'additive',
      ...playback(resolvedPlayback),
      clip: {
        id: `${style}-vertical`,
        durationMs: vertical.durationMs,
        loop: true,
        tracks: [vertical.track],
      },
    },
    {
      blend: 'additive',
      ...playback(resolvedPlayback),
      clip: {
        id: `${style}-rotation`,
        durationMs: rotationTrack.durationMs,
        loop: true,
        tracks: [rotationTrack.track],
      },
    },
    {
      blend: 'additive',
      ...playback(resolvedPlayback),
      clip: {
        id: `${style}-breathing`,
        durationMs: breathingTrack.durationMs,
        loop: true,
        tracks: [breathingTrack.track],
      },
    },
    {
      blend: 'additive',
      ...playback(resolvedPlayback),
      clip: {
        id: `${style}-head-yaw`,
        durationMs: yawTrack.durationMs,
        loop: true,
        tracks: [yawTrack.track],
      },
    },
    {
      blend: 'additive',
      ...playback(resolvedPlayback),
      clip: {
        id: `${style}-head-roll`,
        durationMs: rollTrack.durationMs,
        loop: true,
        tracks: [rollTrack.track],
      },
    },
    blinkLayer(
      style,
      resolvedPlayback,
      defaults.blinkIntervalMs,
      variation,
      seed + 7,
      cycleCount,
    ),
  ]
}

/** Faster bounce and squash-and-stretch for energetic mascots. */
export function createLivelyMotion(options: LivelyMotionOptions = {}): MotionLayer[] {
  const amplitudeX = nonNegative('amplitudeX', options.amplitudeX ?? 0)
  const amplitudeY = nonNegative('amplitudeY', options.amplitudeY ?? 8)
  const periodMs = positive('periodMs', options.periodMs ?? 1800)
  const rotation = nonNegative('rotation', options.rotation ?? 0.022)
  const squash = nonNegative('squash', options.squash ?? 0.012)
  const headYaw = nonNegative('headYaw', options.headYaw ?? 0.1)
  const headRoll = nonNegative('headRoll', options.headRoll ?? 0.03)
  const expressionPeriodMs = periodMs * 16 / 9
  return [
    {
      blend: 'additive',
      ...playback(options),
      clip: {
        id: 'lively-body',
        durationMs: periodMs,
        loop: true,
        tracks: [
          cycleTrack(
            { kind: 'root', property: 'translateX' },
            periodMs,
            [amplitudeX, 0, -amplitudeX, 0, amplitudeX],
          ),
          cycleTrack(
            { kind: 'root', property: 'translateY' },
            periodMs,
            [amplitudeY * 0.25, -amplitudeY, 0, amplitudeY * 0.4, amplitudeY * 0.25],
          ),
          cycleTrack(
            { kind: 'root', property: 'rotation' },
            periodMs,
            [-rotation * 0.8, 0, rotation, 0, -rotation * 0.8],
          ),
          cycleTrack(
            { kind: 'root', property: 'scaleX' },
            periodMs,
            [squash * 0.67, -squash * 0.33, 0, squash, squash * 0.67],
          ),
          cycleTrack(
            { kind: 'root', property: 'scaleY' },
            periodMs,
            [-squash * 0.5, squash * 0.67, 0, -squash, -squash * 0.5],
          ),
        ],
      },
    },
    {
      blend: 'additive',
      ...playback(options),
      clip: {
        id: 'lively-expression',
        durationMs: expressionPeriodMs,
        loop: true,
        tracks: [
          cycleTrack(
            { kind: 'parameter', id: 'headYaw' },
            expressionPeriodMs,
            [-headYaw, headYaw, -headYaw],
          ),
          cycleTrack(
            { kind: 'parameter', id: 'headRoll' },
            expressionPeriodMs,
            [headRoll, -headRoll, headRoll],
          ),
        ],
      },
    },
    blinkLayer('lively', options, 3300),
  ]
}
