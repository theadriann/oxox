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
      options: undefined,
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

  it('forwards force reindex options to the scanner worker', async () => {
    const worker = createWorkerDouble()
    const scanner = createBackgroundArtifactScanner({
      userDataPath: '/tmp/oxox-user-data',
      sessionsRoot: '/tmp/oxox-sessions',
      workerFactory: vi.fn(() => worker),
    })

    const onProgress = vi.fn()
    const syncPromise = scanner.sync({ force: true, onProgress })

    expect(worker.postMessage).toHaveBeenCalledWith({
      id: 1,
      options: { force: true },
      type: 'sync',
    })

    worker.emitMessage({
      id: 1,
      progress: {
        deletedCount: 0,
        phase: 'indexing',
        processedCount: 2,
        skippedCount: 0,
        startedAt: '2026-06-23T00:00:00.000Z',
        totalCount: 4,
        unreadableCount: 0,
        updatedAt: '2026-06-23T00:00:01.000Z',
        visitedCount: 2,
      },
      type: 'progress',
    })
    worker.emitMessage({
      id: 1,
      ok: true,
      type: 'result',
      report: {
        deletedCount: 0,
        durationMs: 12,
        processedCount: 4,
        skippedCount: 0,
        unreadableCount: 0,
      },
    })

    await expect(syncPromise).resolves.toMatchObject({
      processedCount: 4,
      skippedCount: 0,
    })
    expect(onProgress).toHaveBeenCalledWith(
      expect.objectContaining({
        phase: 'indexing',
        totalCount: 4,
        visitedCount: 2,
      }),
    )
  })
})
