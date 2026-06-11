import { Worker } from 'node:worker_threads'

import type {
  FoundationBootstrap,
  SessionSearchIndexingProgress,
} from '../../../shared/ipc/contracts'

export interface SessionSearchHydrationWorkerOptions {
  backgroundHydrationBatchDelayMs: number
  backgroundHydrationBatchSize: number
  backgroundHydrationLimit: number
  bootstrap: FoundationBootstrap
  hydrationYieldMs: number
  maxIndexedContentChars: number
  maxIndexedFragmentsPerSession: number
  maxIndexedSourceRecordsPerSession: number
  maxIndexedToolChars: number
  persistFoundationMetadata: boolean
  searchDatabasePath: string
}

type WorkerRequestMessage = {
  type: 'replaceFoundation'
  bootstrap: FoundationBootstrap
}

type WorkerProgressMessage = {
  type: 'progress'
  progress: SessionSearchIndexingProgress
}

type WorkerMessage = WorkerProgressMessage

interface SessionSearchHydrationWorkerLike {
  postMessage: (message: WorkerRequestMessage) => void
  on: (
    event: 'message' | 'error' | 'exit',
    listener:
      | ((message: WorkerMessage) => void)
      | ((error: Error) => void)
      | ((code: number) => void),
  ) => void
  terminate: () => Promise<number>
}

interface CreateBackgroundSessionSearchHydratorOptions extends SessionSearchHydrationWorkerOptions {
  workerFactory?: (options: SessionSearchHydrationWorkerOptions) => SessionSearchHydrationWorkerLike
}

export interface BackgroundSessionSearchHydrator {
  getIndexingProgress: () => SessionSearchIndexingProgress
  replaceFoundation: (bootstrap: FoundationBootstrap) => void
  close: () => Promise<void>
}

const DEFAULT_WORKER_URL = new URL('./session-search-hydration-worker.js', import.meta.url)

export function createBackgroundSessionSearchHydrator({
  workerFactory = (options) =>
    new Worker(DEFAULT_WORKER_URL, {
      type: 'module',
      workerData: options,
    }),
  ...options
}: CreateBackgroundSessionSearchHydratorOptions): BackgroundSessionSearchHydrator {
  let progress = createIndexingProgress(0, 0, false)
  let worker: SessionSearchHydrationWorkerLike | null = workerFactory(options)

  worker.on('message', (message) => {
    if (message.type === 'progress') {
      progress = message.progress
    }
  })
  worker.on('error', (error) => {
    console.error('Search hydration worker failed', error)
    progress = createIndexingProgress(progress.indexedSessions, progress.totalSessions, false)
    worker = null
  })
  worker.on('exit', () => {
    progress = createIndexingProgress(progress.indexedSessions, progress.totalSessions, false)
    worker = null
  })

  return {
    getIndexingProgress: () => progress,
    replaceFoundation: (bootstrap) => {
      worker?.postMessage({
        type: 'replaceFoundation',
        bootstrap,
      })
    },
    close: async () => {
      const activeWorker = worker
      worker = null

      if (!activeWorker) {
        return
      }

      await activeWorker.terminate()
    },
  }
}

function createIndexingProgress(
  indexedSessions: number,
  totalSessions: number,
  isIndexing: boolean,
): SessionSearchIndexingProgress {
  return {
    indexedSessions,
    totalSessions,
    isIndexing,
    updatedAt: new Date().toISOString(),
  }
}
