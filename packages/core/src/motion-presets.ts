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
    interpolation: 'smoothstep',
    keyframes: values.map((value, index) => ({
      timeMs: durationMs * index / (values.length - 1),
      value,
    })),
  }
}

function blinkLayer(
  id: string,
  options: MotionPlaybackOptions,
  defaultIntervalMs: number,
): MotionLayer {
  const intervalMs = positive('blinkIntervalMs', options.blinkIntervalMs ?? defaultIntervalMs)
  const durationMs = positive('blinkDurationMs', options.blinkDurationMs ?? 170)
  if (intervalMs <= durationMs + 600) {
    throw new Error('motion preset blinkIntervalMs must exceed blinkDurationMs by 600ms')
  }
  const startMs = intervalMs - durationMs - 600
  const safeStartMs = Math.max(0, startMs)
  const middleMs = safeStartMs + durationMs / 2
  const endMs = safeStartMs + durationMs
  const eyeTrack = (id: string): MotionTrack => ({
    target: { kind: 'parameter', id },
    interpolation: 'smoothstep',
    keyframes: [
      { timeMs: 0, value: 1 },
      { timeMs: safeStartMs, value: 1 },
      { timeMs: middleMs, value: 0 },
      { timeMs: endMs, value: 1 },
      { timeMs: intervalMs, value: 1 },
    ],
  })
  return {
    blend: 'override',
    ...playback(options),
    clip: {
      id: `${id}-blink`,
      durationMs: intervalMs,
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
  const resolvedPlayback: MotionPlaybackOptions = {
    ...options,
    offsetMs: options.offsetMs ?? defaults.offsetMs,
    blinkIntervalMs: options.blinkIntervalMs ?? defaults.blinkIntervalMs,
  }
  return [
    {
      blend: 'additive',
      ...playback(resolvedPlayback),
      clip: {
        id: `${style}-horizontal`,
        durationMs: periodXMs,
        loop: true,
        tracks: [
          cycleTrack(
            { kind: 'root', property: 'translateX' },
            periodXMs,
            [amplitudeX, 0, -amplitudeX, 0, amplitudeX],
          ),
        ],
      },
    },
    {
      blend: 'additive',
      ...playback(resolvedPlayback),
      clip: {
        id: `${style}-vertical`,
        durationMs: periodYMs,
        loop: true,
        tracks: [
          cycleTrack(
            { kind: 'root', property: 'translateY' },
            periodYMs,
            [0, -amplitudeY, 0, amplitudeY * 0.65, 0],
          ),
        ],
      },
    },
    {
      blend: 'additive',
      ...playback(resolvedPlayback),
      clip: {
        id: `${style}-rotation`,
        durationMs: rotationPeriodMs,
        loop: true,
        tracks: [
          cycleTrack(
            { kind: 'root', property: 'rotation' },
            rotationPeriodMs,
            [0, rotation, 0, -rotation, 0],
          ),
        ],
      },
    },
    {
      blend: 'additive',
      ...playback(resolvedPlayback),
      clip: {
        id: `${style}-breathing`,
        durationMs: breathingPeriodMs,
        loop: true,
        tracks: [
          cycleTrack(
            { kind: 'root', property: 'scaleY' },
            breathingPeriodMs,
            [0, breathing, 0, -breathing * 0.5, 0],
          ),
        ],
      },
    },
    {
      blend: 'additive',
      ...playback(resolvedPlayback),
      clip: {
        id: `${style}-expression`,
        durationMs: headPeriodMs,
        loop: true,
        tracks: [
          cycleTrack(
            { kind: 'parameter', id: 'headYaw' },
            headPeriodMs,
            [-headYaw, headYaw, -headYaw],
          ),
          cycleTrack(
            { kind: 'parameter', id: 'headRoll' },
            headPeriodMs,
            [headRoll, -headRoll, headRoll],
          ),
        ],
      },
    },
    blinkLayer(style, resolvedPlayback, defaults.blinkIntervalMs),
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
