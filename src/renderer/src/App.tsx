import { domAnimation, LazyMotion, MotionConfig, useReducedMotion } from 'framer-motion'

import { AppShell } from './components/app-shell/AppShell'
import { MOTION_DURATION_SECONDS, MOTION_EASING } from './lib/motion'

function App() {
  const prefersReducedMotion = useReducedMotion()

  return (
    <LazyMotion features={domAnimation}>
      <MotionConfig
        reducedMotion="user"
        transition={{
          duration: prefersReducedMotion ? 0 : MOTION_DURATION_SECONDS.micro,
          ease: MOTION_EASING.default,
        }}
      >
        <AppShell />
      </MotionConfig>
    </LazyMotion>
  )
}

export default App
