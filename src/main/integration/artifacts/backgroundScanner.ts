import { Worker } from 'node:worker_threads'

import type { ArtifactScanner, ArtifactScannerReport } from './scanner'

type SyncRequestMessage = {
  id: number
  type: 'sync'
}

type SyncSuccessMessage = {
  id: number
  ok: true
  report: ArtifactScannerReport
}

type SyncFailureMessage = {
  id: number
  ok: false
  error: string
}

type WorkerResponseMessage = SyncSuccessMessage | SyncFailureMessage

interface ArtifactScannerWorkerLike {
  postMessage: (message: SyncRequestMessage) => void
  on: (
    event: 'message' | 'error' | 'exit',
    listener:
      | ((message: WorkerResponseMessage) => void)
      | ((error: Error) => void)
      | ((code: number) => void),
  ) => void
  terminate: () => Promise<number>
}

interface CreateBackgroundArtifactScannerOptions {
  userDataPath: string
  sessionsRoot: string
  workerFactory?: (options: {
    userDataPath: string
    sessionsRoot: string
  }) => ArtifactScannerWorkerLike
}

const DEFAULT_WORKER_URL = new URL('./artifact-scanner-worker.js', import.meta.url)

export function createBackgroundArtifactScanner({
  userDataPath,
  sessionsRoot,
  workerFactory = ({ userDataPath: nextUserDataPath, sessionsRoot: nextSessionsRoot }) =>
    new Worker(DEFAULT_WORKER_URL, {
      type: 'module',
      workerData: {
        userDataPath: nextUserDataPath,
        sessionsRoot: nextSessionsRoot,
      },
    }),
}: CreateBackgroundArtifactScannerOptions): ArtifactScanner {
  let worker: ArtifactScannerWorkerLike | null = null
  let nextRequestId = 0
  const pending = new Map<
    number,
    {
      resolve: (report: ArtifactScannerReport) => void
      reject: (error: Error) => void
    }
  >()

  const rejectPending = (error: Error): void => {
    for (const request of pending.values()) {
      request.reject(error)
    }

    pending.clear()
  }

  const ensureWorker = (): ArtifactScannerWorkerLike => {
    if (worker) {
      return worker
    }

    worker = workerFactory({ userDataPath, sessionsRoot })
    worker.on('message', (message) => {
      const request = pending.get(message.id)

      if (!request) {
        return
      }

      pending.delete(message.id)

      if (message.ok) {
        request.resolve(message.report)
        return
      }

      request.reject(new Error(message.error))
    })
    worker.on('error', (error) => {
      rejectPending(error)
      worker = null
    })
    worker.on('exit', (code) => {
      if (pending.size > 0) {
        rejectPending(new Error(`Artifact scanner worker exited with code ${code}.`))
      }

      worker = null
    })

    return worker
  }

  return {
    sync: () =>
      new Promise<ArtifactScannerReport>((resolve, reject) => {
        const requestId = nextRequestId + 1
        nextRequestId = requestId
        pending.set(requestId, { resolve, reject })
        ensureWorker().postMessage({
          id: requestId,
          type: 'sync',
        })
      }),
    close: async () => {
      const activeWorker = worker
      worker = null
      rejectPending(new Error('Artifact scanner worker closed.'))

      if (!activeWorker) {
        return
      }

      await activeWorker.terminate()
    },
  }
}
