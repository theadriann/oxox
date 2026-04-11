import type { TargetAndTransition, Transition, Variants } from 'framer-motion'

export const MOTION_EASING = {
  default: [0.16, 1, 0.3, 1],
  exit: [0.4, 0, 0.7, 0.2],
} as const

export const MOTION_DURATION_SECONDS = {
  micro: 0.12,
  layout: 0.24,
  view: 0.28,
} as const

const PANEL_OFFSET_PX = 10
const VIEW_OFFSET_PX = 6

function shouldInstantMotion(reduceMotion: boolean): boolean {
  return reduceMotion || isJsdomEnvironment()
}

function isJsdomEnvironment(): boolean {
  return typeof navigator !== 'undefined' && /jsdom/i.test(navigator.userAgent)
}

export function shouldAnimateMotion(reduceMotion: boolean): boolean {
  return !shouldInstantMotion(reduceMotion)
}

export function createMicroInteractionTransition(reduceMotion: boolean): Transition {
  const instantMotion = shouldInstantMotion(reduceMotion)

  return {
    duration: instantMotion ? 0 : MOTION_DURATION_SECONDS.micro,
    ease: MOTION_EASING.default,
  }
}

export function createLayoutTransition(reduceMotion: boolean): Transition {
  const instantMotion = shouldInstantMotion(reduceMotion)

  return {
    duration: instantMotion ? 0 : MOTION_DURATION_SECONDS.layout,
    ease: MOTION_EASING.default,
  }
}

export function createExitTransition(reduceMotion: boolean): Transition {
  const instantMotion = shouldInstantMotion(reduceMotion)

  return {
    duration: instantMotion ? 0 : MOTION_DURATION_SECONDS.micro * 0.7,
    ease: MOTION_EASING.exit,
  }
}

export function createPanelVariants(reduceMotion: boolean, edge: 'left' | 'right'): Variants {
  const instantMotion = shouldInstantMotion(reduceMotion)
  const offset = instantMotion ? 0 : edge === 'left' ? -PANEL_OFFSET_PX : PANEL_OFFSET_PX

  return {
    initial: {
      opacity: instantMotion ? 1 : 0,
      x: offset,
    },
    animate: {
      opacity: 1,
      x: 0,
      transition: createLayoutTransition(reduceMotion),
    },
    exit: {
      opacity: instantMotion ? 1 : 0,
      x: -offset,
      transition: createExitTransition(reduceMotion),
    },
  }
}

export function createViewPresenceVariants(reduceMotion: boolean): Variants {
  const instantMotion = shouldInstantMotion(reduceMotion)

  return {
    initial: {
      opacity: instantMotion ? 1 : 0,
      y: instantMotion ? 0 : VIEW_OFFSET_PX,
    },
    animate: {
      opacity: 1,
      y: 0,
      transition: {
        duration: instantMotion ? 0 : MOTION_DURATION_SECONDS.view,
        ease: MOTION_EASING.default,
      },
    },
    exit: {
      opacity: instantMotion ? 1 : 0,
      y: instantMotion ? 0 : -VIEW_OFFSET_PX / 2,
      transition: createExitTransition(reduceMotion),
    },
  }
}

export function createCollapsibleVariants(reduceMotion: boolean): Variants {
  const instantMotion = shouldInstantMotion(reduceMotion)

  return {
    initial: {
      height: 0,
      opacity: instantMotion ? 1 : 0,
    },
    animate: {
      height: 'auto',
      opacity: 1,
      transition: createLayoutTransition(reduceMotion),
    },
    exit: {
      height: 0,
      opacity: instantMotion ? 1 : 0,
      transition: createExitTransition(reduceMotion),
    },
  }
}

export function createListItemVariants(reduceMotion: boolean): Variants {
  const instantMotion = shouldInstantMotion(reduceMotion)

  return {
    initial: {
      opacity: instantMotion ? 1 : 0,
      y: instantMotion ? 0 : 4,
    },
    animate: {
      opacity: 1,
      y: 0,
      transition: createMicroInteractionTransition(reduceMotion),
    },
    exit: {
      opacity: instantMotion ? 1 : 0,
      y: instantMotion ? 0 : -3,
      transition: createExitTransition(reduceMotion),
    },
  }
}

export function createStatusDotTarget(reduceMotion: boolean): TargetAndTransition {
  return {
    opacity: 1,
    scale: 1,
    transition: createMicroInteractionTransition(reduceMotion),
  }
}
