import { describe, expect, it, vi } from 'vitest'

import type {
  FoundationBootstrap,
  SessionSearchIndexingProgress,
} from '../../../shared/ipc/contracts'
import { createBackgroundSessionSearchHydrator } from '../search/sessionSearchHydrationWorker'

type MessageListener = (payload: unknown) => void
type ErrorListener = (error: Error) => void
type ExitListener = (code: number) => void

function createBootstrap(sessionId = 'session-1'): FoundationBootstrap {
  return {
    database: {
      path: '/tmp/oxox.db',
      exists: true,
      journalMode: 'wal',
      tableNames: [],
    },
    droidCli: {
      available: true,
      path: '/usr/local/bin/droid',
      version: 'droid 1.0.0',
      searchedLocations: ['/usr/local/bin/droid'],
      error: null,
    },
    daemon: {
      status: 'disconnected',
      connectedPort: null,
      target: null,
      lastError: null,
      lastConnectedAt: null,
      lastSyncAt: null,
      nextRetryDelayMs: null,
    },
    projects: [],
    sessions: [
      {
        id: sessionId,
        projectId: null,
        projectWorkspacePath: '/tmp/project',
        projectDisplayName: null,
        modelId: null,
        parentSessionId: null,
        derivationType: null,
        owner: null,
        messageCount: 1,
        isFavorite: false,
        decompSessionType: null,
        decompMissionId: null,
        hasUserMessage: true,
        title: 'Session one',
        status: 'completed',
        transport: 'artifacts',
        createdAt: '2026-03-24T20:00:00.000Z',
        lastActivityAt: '2026-03-24T20:05:00.000Z',
        updatedAt: '2026-03-24T20:05:00.000Z',
      },
    ],
    syncMetadata: [
      {
        sessionId,
        sourcePath: `/tmp/${sessionId}.jsonl`,
        lastByteOffset: 100,
        lastMtimeMs: 200,
        lastSyncedAt: '2026-03-24T20:05:00.000Z',
        checksum: '100:200',
      },
    ],
    factoryModels: [],
    factoryDefaultSettings: {},
  }
}

function createProgress(overrides: Partial<SessionSearchIndexingProgress> = {}) {
  return {
    indexedSessions: 1,
    totalSessions: 2,
    isIndexing: true,
    updatedAt: '2026-03-24T20:06:00.000Z',
    ...overrides,
  }
}

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

describe('createBackgroundSessionSearchHydrator', () => {
  it('starts transcript hydration in a worker and tracks progress without main-process hydration', async () => {
    const worker = createWorkerDouble()
    const bootstrap = createBootstrap()
    const workerFactory = vi.fn(() => worker)

    const hydrator = createBackgroundSessionSearchHydrator({
      backgroundHydrationBatchDelayMs: 2_000,
      backgroundHydrationBatchSize: 1,
      backgroundHydrationLimit: 50,
      bootstrap,
      hydrationYieldMs: 250,
      maxIndexedContentChars: 20_000,
      maxIndexedFragmentsPerSession: 300,
      maxIndexedSourceRecordsPerSession: 500,
      maxIndexedToolChars: 10_000,
      persistFoundationMetadata: false,
      searchDatabasePath: '/tmp/session-search.db',
      workerFactory,
    })

    expect(workerFactory).toHaveBeenCalledWith(
      expect.objectContaining({
        bootstrap,
        searchDatabasePath: '/tmp/session-search.db',
        backgroundHydrationLimit: 50,
        persistFoundationMetadata: false,
      }),
    )

    const progress = createProgress()
    worker.emitMessage({
      type: 'progress',
      progress,
    })

    expect(hydrator.getIndexingProgress()).toEqual(progress)

    const nextBootstrap = createBootstrap('session-2')
    hydrator.replaceFoundation(nextBootstrap)

    expect(worker.postMessage).toHaveBeenCalledWith({
      type: 'replaceFoundation',
      bootstrap: nextBootstrap,
    })

    await hydrator.close()

    expect(worker.terminate).toHaveBeenCalledTimes(1)
  })

  it('runs search requests through the worker thread', async () => {
    const worker = createWorkerDouble()
    const hydrator = createBackgroundSessionSearchHydrator({
      backgroundHydrationBatchDelayMs: 2_000,
      backgroundHydrationBatchSize: 1,
      backgroundHydrationLimit: 50,
      bootstrap: createBootstrap(),
      hydrationYieldMs: 250,
      maxIndexedContentChars: 20_000,
      maxIndexedFragmentsPerSession: 300,
      maxIndexedSourceRecordsPerSession: 500,
      maxIndexedToolChars: 10_000,
      persistFoundationMetadata: false,
      searchDatabasePath: '/tmp/session-search.db',
      workerFactory: () => worker,
    })

    const searchPromise = hydrator.searchSessions({ query: 'needle', limit: 5 })

    expect(worker.postMessage).toHaveBeenCalledWith({
      id: 1,
      request: { query: 'needle', limit: 5 },
      type: 'search',
    })

    worker.emitMessage({
      id: 1,
      response: {
        hits: [],
        matches: [{ sessionId: 'session-1', score: 1, reasons: [] }],
        query: 'needle',
      },
      type: 'searchResult',
    })

    await expect(searchPromise).resolves.toMatchObject({
      matches: [{ sessionId: 'session-1' }],
      query: 'needle',
    })
  })
})
