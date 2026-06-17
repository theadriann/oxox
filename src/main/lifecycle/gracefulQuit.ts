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
  requestQuit: (finalize?: () => void) => boolean
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

  const runGracefulQuit = async (finalize: () => void): Promise<void> => {
    try {
      await detachActiveSessions()
      persistOpenWindows()
      await stopKernel()
      inFlight = false
      finalize()
    } catch (error) {
      inFlight = false
      quitting = false
      onError(error)
    }
  }

  const beginGracefulQuit = (finalize: () => void): boolean => {
    if (quitting || inFlight) {
      return false
    }

    quitting = true
    inFlight = true
    void runGracefulQuit(finalize)

    return true
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

      beginGracefulQuit(quitApp)
    },
    isQuitting: () => quitting,
    markQuitting: () => {
      quitting = true
    },
    requestQuit: (finalize = quitApp) => beginGracefulQuit(finalize),
  }
}
