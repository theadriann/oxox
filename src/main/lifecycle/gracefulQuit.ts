interface BeforeQuitEventLike {
  preventDefault: () => void
}

interface CreateGracefulQuitControllerOptions {
  detachActiveSessions: () => Promise<void>
  persistOpenWindows: () => void
  stopKernel: () => Promise<void>
  quitApp: () => void
  onError: (error: unknown) => void
}

export interface GracefulQuitController {
  handleBeforeQuit: (event: BeforeQuitEventLike) => void
  isQuitting: () => boolean
  markQuitting: () => void
}

export function createGracefulQuitController({
  detachActiveSessions,
  persistOpenWindows,
  stopKernel,
  quitApp,
  onError,
}: CreateGracefulQuitControllerOptions): GracefulQuitController {
  let quitting = false
  let inFlight = false

  const runGracefulQuit = async (): Promise<void> => {
    try {
      await detachActiveSessions()
      persistOpenWindows()
      await stopKernel()
      inFlight = false
      quitApp()
    } catch (error) {
      inFlight = false
      quitting = false
      onError(error)
    }
  }

  return {
    handleBeforeQuit: (event) => {
      if (quitting && !inFlight) {
        return
      }

      event.preventDefault()

      if (inFlight) {
        return
      }

      quitting = true
      inFlight = true
      void runGracefulQuit()
    },
    isQuitting: () => quitting,
    markQuitting: () => {
      quitting = true
    },
  }
}
