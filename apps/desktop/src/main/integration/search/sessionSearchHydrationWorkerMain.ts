import { parentPort, workerData } from 'node:worker_threads'

import type {
  FoundationBootstrap,
  LiveSessionSnapshot,
  SessionSearchRequest,
} from '../../../shared/ipc/contracts'
import { loadSessionTranscriptFromFile } from '../transcripts/service'
import type { SessionSearchHydrationWorkerOptions } from './sessionSearchHydrationWorker'
import { createSessionSearchService } from './sessionSearchService'

type WorkerRequestMessage =
  | {
      type: 'replaceFoundation'
      bootstrap: FoundationBootstrap
    }
  | {
      type: 'deleteSession'
      sessionId: string
    }
  | {
      type: 'liveSnapshotUpdate'
      snapshot: LiveSessionSnapshot
    }
  | {
      type: 'search'
      id: number
      request: SessionSearchRequest
    }

const options = workerData as SessionSearchHydrationWorkerOptions
const service = createSessionSearchService({
  bootstrap: options.bootstrap,
  loadSessionTranscript: loadSessionTranscriptFromFile,
  backgroundHydrationBatchDelayMs: options.backgroundHydrationBatchDelayMs,
  backgroundHydrationBatchSize: options.backgroundHydrationBatchSize,
  backgroundHydrationDelayMs: 0,
  backgroundHydrationLimit: options.backgroundHydrationLimit,
  hydrationYieldMs: options.hydrationYieldMs,
  maxIndexedContentChars: options.maxIndexedContentChars,
  maxIndexedFragmentsPerSession: options.maxIndexedFragmentsPerSession,
  maxIndexedSourceRecordsPerSession: options.maxIndexedSourceRecordsPerSession,
  maxIndexedToolChars: options.maxIndexedToolChars,
  persistFoundationMetadata: options.persistFoundationMetadata,
  searchDatabasePath: options.searchDatabasePath,
})

function postProgress(): void {
  parentPort?.postMessage({
    type: 'progress',
    progress: service.getIndexingProgress(),
  })
}

function postProgressUntilCurrentHydrationCompletes(): void {
  postProgress()
  void service.waitForHydration().finally(postProgress)
}

const progressTimer = setInterval(postProgress, 500)
postProgressUntilCurrentHydrationCompletes()

parentPort?.on('message', (message: WorkerRequestMessage) => {
  try {
    if (message.type === 'search') {
      parentPort?.postMessage({
        type: 'searchResult',
        id: message.id,
        response: service.searchSessions(message.request),
      })

      return
    }

    if (message.type === 'deleteSession') {
      service.deleteSession(message.sessionId)
      return
    }

    if (message.type === 'liveSnapshotUpdate') {
      service.scheduleLiveSnapshotUpdate(message.snapshot)
      return
    }

    if (message.type === 'replaceFoundation') {
      service.replaceFoundation(message.bootstrap)
      postProgressUntilCurrentHydrationCompletes()
    }
  } catch (error) {
    if (message.type === 'search') {
      parentPort?.postMessage({
        type: 'searchError',
        id: message.id,
        error: error instanceof Error ? error.message : String(error),
      })
      return
    }

    console.error('Search hydration worker request failed', error)
  }
})

process.on('exit', () => {
  clearInterval(progressTimer)
  service.dispose()
})
