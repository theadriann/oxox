import { describe, expect, it, vi } from 'vitest'

import { createBackgroundArtifactScanner } from '../artifacts/backgroundScanner'

type MessageListener = (payload: unknown) => void
type ErrorListener = (error: Error) => void
type ExitListener = (code: number) => void

function createWorkerDouble() {
  let messageListener: MessageListener | undefined
  let errorListener: ErrorListener | undefined
  let exitListener: ExitListener | undefined

  return {
    postMessage: vi.fn(),
    terminate: vi.fn().mockResolvedValue(0),
    on: vi.fn((event: string, listener: MessageListener | ErrorListener | ExitListener) => {
      if (event === 'message') messageListener = listener as MessageListener
      if (event === 'error') errorListener = listener as ErrorListener
      if (event === 'exit') exitListener = listener as ExitListener
      return undefined
    }),
    emitMessage: (payload: unknown) => messageListener?.(payload),
    emitError: (error: Error) => errorListener?.(error),
    emitExit: (code: number) => exitListener?.(code),
  }
}

describe('createBackgroundArtifactScanner', () => {
  it('sends sync work to a worker and resolves the reported scan result', async () => {
    const worker = createWorkerDouble()
    const scanner = createBackgroundArtifactScanner({
      userDataPath: '/tmp/oxox-user-data',
      sessionsRoot: '/tmp/oxox-sessions',
      workerFactory: vi.fn(() => worker),
    })

    const syncPromise = scanner.sync()

    expect(worker.postMessage).toHaveBeenCalledWith({
      id: 1,
      type: 'sync',
    })

    worker.emitMessage({
      id: 1,
      ok: true,
      report: {
        deletedCount: 0,
        durationMs: 12,
        processedCount: 4,
        skippedCount: 2,
        unreadableCount: 0,
      },
    })

    await expect(syncPromise).resolves.toEqual({
      deletedCount: 0,
      durationMs: 12,
      processedCount: 4,
      skippedCount: 2,
      unreadableCount: 0,
    })

    await scanner.close()

    expect(worker.terminate).toHaveBeenCalledTimes(1)
  })
})
