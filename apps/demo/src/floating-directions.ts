import { createFloatingMotion } from '@mabataki/core'
import type { MotionLayer } from '@mabataki/core'

export const FLOATING_DIRECTION_IDS = ['hover', 'balloon', 'ghost'] as const
export type FloatingDirectionId = typeof FLOATING_DIRECTION_IDS[number]

export interface FloatingDirection {
  description: string
  layers: MotionLayer[]
}

export const FLOATING_DIRECTIONS: Record<FloatingDirectionId, FloatingDirection> = {
  hover: {
    description: 'Quiet and stable. Small horizontal drift with independent, slow body rhythms.',
    layers: createFloatingMotion({ style: 'hover' }),
  },
  balloon: {
    description: 'Broad and gentle. More travel and tilt, with long periods and soft breathing.',
    layers: createFloatingMotion({ style: 'balloon' }),
  },
  ghost: {
    description: 'Restless and uncanny. Short, mismatched periods prevent an obvious repeated orbit.',
    layers: createFloatingMotion({ style: 'ghost' }),
  },
}
