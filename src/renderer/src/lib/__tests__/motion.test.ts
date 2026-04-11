import { describe, expect, it } from 'vitest'

import {
  createLayoutTransition,
  createMicroInteractionTransition,
  MOTION_DURATION_SECONDS,
  MOTION_EASING,
} from '../motion'

describe('motion tokens', () => {
  it('keeps micro and layout animation timings within the polish specification', () => {
    const microTransition = createMicroInteractionTransition(false)
    const layoutTransition = createLayoutTransition(false)

    expect(MOTION_DURATION_SECONDS.micro).toBeGreaterThanOrEqual(0.08)
    expect(MOTION_DURATION_SECONDS.micro).toBeLessThanOrEqual(0.2)
    expect(MOTION_DURATION_SECONDS.layout).toBeGreaterThanOrEqual(0.15)
    expect(MOTION_DURATION_SECONDS.layout).toBeLessThanOrEqual(0.35)
    expect(microTransition.duration).toBe(MOTION_DURATION_SECONDS.micro)
    expect(layoutTransition.duration).toBe(MOTION_DURATION_SECONDS.layout)
    expect(MOTION_EASING.default).toHaveLength(4)
    expect(MOTION_EASING.default).not.toEqual([0, 0, 1, 1])
    expect(MOTION_EASING.exit).toHaveLength(4)
    expect(MOTION_EASING.exit).not.toEqual([0, 0, 1, 1])
  })

  it('disables non-essential animation timings when reduced motion is enabled', () => {
    expect(createMicroInteractionTransition(true)).toMatchObject({
      duration: 0,
    })
    expect(createLayoutTransition(true)).toMatchObject({
      duration: 0,
    })
  })
})
