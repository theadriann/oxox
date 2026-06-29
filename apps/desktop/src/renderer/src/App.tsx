import { domAnimation, LazyMotion, MotionConfig, useReducedMotion } from 'framer-motion'
import { useEffect, useState } from 'react'

import { AppShell } from './components/app-shell/AppShell'
import {
  createDebugLabRoute,
  DebugLab,
  type DebugLabRoute,
  type DebugTranscriptRequest,
  getDebugHelpCommands,
  getInitialDebugLabRoute,
} from './components/debug/DebugLab'
import { Toaster } from './components/ui/sonner'
import { MOTION_DURATION_SECONDS, MOTION_EASING } from './lib/motion'

function App() {
  const prefersReducedMotion = useReducedMotion()
  const [debugRoute, setDebugRoute] = useState<DebugLabRoute | null>(() =>
    getInitialDebugLabRoute(),
  )

  useEffect(() => {
    window.oxoxDebug = {
      close: () => setDebugRoute(null),
      help: getDebugHelpCommands,
      open: () => setDebugRoute({ view: 'home' }),
      renderBakedTranscript: (request: Omit<DebugTranscriptRequest, 'entries' | 'items'> = {}) =>
        setDebugRoute(createDebugLabRoute(request)),
      renderTranscript: (request: DebugTranscriptRequest = {}) =>
        setDebugRoute(createDebugLabRoute(request)),
    }

    return () => {
      delete window.oxoxDebug
    }
  }, [])

  return (
    <LazyMotion features={domAnimation}>
      <MotionConfig
        reducedMotion="user"
        transition={{
          duration: prefersReducedMotion ? 0 : MOTION_DURATION_SECONDS.micro,
          ease: MOTION_EASING.default,
        }}
      >
        {debugRoute ? <DebugLab route={debugRoute} /> : <AppShell />}
        <Toaster />
      </MotionConfig>
    </LazyMotion>
  )
}

export default App
