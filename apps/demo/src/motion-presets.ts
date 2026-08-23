import {
  createFloatingMotion,
  createGroundedMotion,
  createLivelyMotion,
} from '@mabataki/core'
import type { MotionLayer } from '@mabataki/core'

export const MOTION_PRESET_IDS = [
  'grounded',
  'hover',
  'balloon',
  'ghost',
  'lively',
] as const
export type MotionPresetId = typeof MOTION_PRESET_IDS[number]

export const MOTION_LAB_PRESET_IDS = ['grounded', 'floating', 'lively'] as const
export type MotionLabPresetId = typeof MOTION_LAB_PRESET_IDS[number]

export interface MotionPreset {
  label: string
  description: string
  layers: MotionLayer[]
}

export const MOTION_PRESETS: Record<MotionPresetId, MotionPreset> = {
  grounded: {
    label: 'grounded',
    description: 'No root translation; only a restrained gaze, tilt, and blink.',
    layers: createGroundedMotion(),
  },
  hover: {
    label: 'hover',
    description: 'Quiet floating with small horizontal drift and subtle body rhythms.',
    layers: createFloatingMotion({ style: 'hover' }),
  },
  balloon: {
    label: 'balloon',
    description: 'Broad, gentle floating with long periods and soft breathing.',
    layers: createFloatingMotion({ style: 'balloon' }),
  },
  ghost: {
    label: 'ghost',
    description: 'Restless floating with mismatched periods and a less predictable path.',
    layers: createFloatingMotion({ style: 'ghost' }),
  },
  lively: {
    label: 'lively',
    description: 'Fast bounce, squash-and-stretch, larger head motion, and blink.',
    layers: createLivelyMotion(),
  },
}

export const MOTION_LAB_PRESETS: Record<MotionLabPresetId, MotionPreset> = {
  grounded: MOTION_PRESETS.grounded,
  floating: {
    label: 'floating',
    description: 'Adjustable floating motion for testing horizontal and vertical travel.',
    layers: createFloatingMotion(),
  },
  lively: MOTION_PRESETS.lively,
}
