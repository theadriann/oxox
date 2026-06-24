import { Worker } from 'node:worker_threads'

import type {
  FoundationBootstrap,
  SessionSearchIndexingProgress,
  SessionSearchRequest,
  SessionSearchResponse,
} from '../../../shared/ipc/contracts'

export interface SessionSearchHydrationWorkerOptions {
  backgroundHydrationBatchDelayMs: number
  backgroundHydrationBatchSize: number
  backgroundHydrationLimit: number
  bootstrap: FoundationBootstrap
  hydrationYieldMs: number
  maxIndexedContentChars: number
  maxIndexedFragmentsPerSession?: number
  maxIndexedSourceRecordsPerSession?: number
  maxIndexedToolChars: number
  persistFoundationMetadata: boolean
  searchDatabasePath: string
}

type WorkerRequestMessage =
  | {
      type: 'replaceFoundation'
      bootstrap: FoundationBootstrap
    }
  | {
      type: 'search'
      id: number
      request: SessionSearchRequest
    }

type WorkerProgressMessage = {
  type: 'progress'
  progress: SessionSearchIndexingProgress
}

type WorkerSearchResultMessage = {
  type: 'searchResult'
  id: number
  response: SessionSearchResponse
}

type WorkerSearchErrorMessage = {
  type: 'searchError'
  id: number
  error: string
}

type WorkerMessage = WorkerProgressMessage | WorkerSearchResultMessage | WorkerSearchErrorMessage

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
  searchSessions: (request: SessionSearchRequest) => Promise<SessionSearchResponse>
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
  let nextRequestId = 0
  const pendingSearches = new Map<
    number,
    {
      reject: (error: Error) => void
      resolve: (response: SessionSearchResponse) => void
    }
  >()

  worker.on('message', (message) => {
    if (message.type === 'progress') {
      progress = message.progress
      return
    }

    if (message.type === 'searchResult') {
      pendingSearches.get(message.id)?.resolve(message.response)
      pendingSearches.delete(message.id)
      return
    }

    if (message.type === 'searchError') {
      pendingSearches.get(message.id)?.reject(new Error(message.error))
      pendingSearches.delete(message.id)
    }
  })
  worker.on('error', (error) => {
    console.error('Search hydration worker failed', error)
    progress = createIndexingProgress(progress.indexedSessions, progress.totalSessions, false)
    rejectPendingSearches(error)
    worker = null
  })
  worker.on('exit', () => {
    progress = createIndexingProgress(progress.indexedSessions, progress.totalSessions, false)
    rejectPendingSearches(new Error('Search worker exited.'))
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
    searchSessions: (request) => {
      if (!worker) {
        return Promise.reject(new Error('Search worker unavailable.'))
      }

      nextRequestId += 1
      const id = nextRequestId

      return new Promise((resolve, reject) => {
        pendingSearches.set(id, { reject, resolve })
        worker?.postMessage({ id, request, type: 'search' })
      })
    },
    close: async () => {
      const activeWorker = worker
      worker = null
      rejectPendingSearches(new Error('Search worker closed.'))

      if (!activeWorker) {
        return
      }

      await activeWorker.terminate()
    },
  }

  function rejectPendingSearches(error: Error): void {
    for (const pending of pendingSearches.values()) {
      pending.reject(error)
    }

    pendingSearches.clear()
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
