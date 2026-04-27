import { existsSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, describe, expect, it, vi } from 'vitest'

import type {
  FoundationBootstrap,
  LiveSessionSnapshot,
  SessionRecord,
  SessionTranscript,
} from '../../../shared/ipc/contracts'
import {
  createSessionSearchService,
  type SearchDocument,
  type SessionSearchStore,
} from '../search/sessionSearchService'

function createSession(
  overrides: Partial<SessionRecord> & Pick<SessionRecord, 'id'>,
): SessionRecord {
  return {
    id: overrides.id,
    projectId: overrides.projectId ?? `project-${overrides.id}`,
    projectWorkspacePath: overrides.projectWorkspacePath ?? `/tmp/${overrides.id}`,
    projectDisplayName: overrides.projectDisplayName ?? null,
    modelId: overrides.modelId ?? null,
    parentSessionId: overrides.parentSessionId ?? null,
    derivationType: overrides.derivationType ?? null,
    hasUserMessage: overrides.hasUserMessage ?? true,
    title: overrides.title ?? `Session ${overrides.id}`,
    status: overrides.status ?? 'completed',
    transport: overrides.transport ?? 'artifacts',
    createdAt: overrides.createdAt ?? '2026-03-24T20:00:00.000Z',
    lastActivityAt: overrides.lastActivityAt ?? '2026-03-24T20:05:00.000Z',
    updatedAt: overrides.updatedAt ?? '2026-03-24T20:05:00.000Z',
  }
}

function createBootstrap(sessions: SessionRecord[]): FoundationBootstrap {
  return {
    database: {
      path: '/tmp/oxox.sqlite',
      exists: true,
      journalMode: 'wal',
      tableNames: ['sessions'],
    },
    droidCli: {
      available: true,
      path: '/bin/droid',
      version: 'droid 1.0.0',
      searchedLocations: ['/bin/droid'],
      error: null,
    },
    daemon: {
      status: 'connected',
      connectedPort: 1234,
      lastError: null,
      lastConnectedAt: '2026-03-24T20:00:00.000Z',
      lastSyncAt: '2026-03-24T20:00:00.000Z',
      nextRetryDelayMs: null,
    },
    projects: [],
    sessions,
    syncMetadata: sessions.map((session) => ({
      sourcePath: `/tmp/${session.id}.jsonl`,
      sessionId: session.id,
      lastByteOffset: 0,
      lastMtimeMs: 0,
      lastSyncedAt: '2026-03-24T20:05:00.000Z',
      checksum: null,
    })),
    factoryModels: [],
    factoryDefaultSettings: {},
  }
}

function createTranscript(
  sessionId: string,
  entries: SessionTranscript['entries'],
): SessionTranscript {
  return {
    sessionId,
    sourcePath: `/tmp/${sessionId}.jsonl`,
    loadedAt: '2026-03-24T20:06:00.000Z',
    entries,
  }
}

function createLiveSnapshot(
  overrides: Partial<LiveSessionSnapshot> & Pick<LiveSessionSnapshot, 'sessionId'>,
): LiveSessionSnapshot {
  return {
    sessionId: overrides.sessionId,
    title: overrides.title ?? 'Live session',
    status: overrides.status ?? 'active',
    transport: 'stream-jsonrpc',
    processId: 42,
    viewerCount: 1,
    projectWorkspacePath: overrides.projectWorkspacePath ?? '/tmp/live',
    parentSessionId: null,
    availableModels: [],
    settings: {},
    transcriptRevision: overrides.transcriptRevision ?? 0,
    messages: overrides.messages ?? [],
    events: overrides.events ?? [],
  }
}

function createRecordingSearchStore() {
  const documents = new Map<string, SearchDocument>()
  const replaceMetadataDocuments = vi.fn((nextDocuments: SearchDocument[]) => {
    const nextIds = new Set(nextDocuments.map((document) => document.id))

    for (const id of documents.keys()) {
      if (!nextIds.has(id)) {
        documents.delete(id)
      }
    }

    for (const document of nextDocuments) {
      const existing = documents.get(document.id)
      documents.set(document.id, {
        ...document,
        content: existing?.content ?? '',
        tool: existing?.tool ?? '',
      })
    }
  })
  const upsertDocument = vi.fn((document: SearchDocument) => {
    documents.set(document.id, document)
  })
  const searchDocuments = vi.fn(() => [...documents.values()])
  const listHydratedDocumentIds = vi.fn(() =>
    [...documents.values()]
      .filter((document) => document.content.length > 0 || document.tool.length > 0)
      .map((document) => document.id),
  )
  const store: SessionSearchStore = {
    listHydratedDocumentIds,
    replaceMetadataDocuments,
    upsertDocument,
    searchDocuments,
  }

  return { store, replaceMetadataDocuments, upsertDocument }
}

describe('createSessionSearchService', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('returns metadata matches immediately and prioritizes title matches over path matches', () => {
    const service = createSessionSearchService({
      bootstrap: createBootstrap([
        createSession({
          id: 'session-path',
          title: 'Refactor database',
          projectWorkspacePath: '/tmp/sdk-workspace',
          lastActivityAt: '2026-03-24T20:10:00.000Z',
        }),
        createSession({
          id: 'session-title',
          title: 'SDK runtime update',
          projectWorkspacePath: '/tmp/other',
          lastActivityAt: '2026-03-24T20:00:00.000Z',
        }),
      ]),
      loadSessionTranscript: vi.fn(),
    })

    const result = service.searchSessions({ query: 'sdk' })

    expect(result.matches.map((match) => match.sessionId)).toEqual([
      'session-title',
      'session-path',
    ])
    expect(result.matches[0]?.reasons[0]?.field).toBe('title')
  })

  it('hydrates transcript and tool content asynchronously newest-first', async () => {
    const loadSessionTranscript = vi.fn(async (sessionId: string) =>
      createTranscript(
        sessionId,
        sessionId === 'new-session'
          ? [
              {
                kind: 'message',
                id: 'message-1',
                occurredAt: '2026-03-24T20:10:00.000Z',
                role: 'assistant',
                markdown: 'Auth token rotation is complete',
              },
              {
                kind: 'tool_call',
                id: 'tool-1',
                toolUseId: 'tool-1',
                occurredAt: '2026-03-24T20:10:01.000Z',
                toolName: 'Edit',
                status: 'completed',
                inputMarkdown: 'Update auth config',
                resultMarkdown: 'Wrote token settings',
                resultIsError: false,
              },
            ]
          : [
              {
                kind: 'message',
                id: 'message-old',
                occurredAt: '2026-03-24T19:00:00.000Z',
                role: 'assistant',
                markdown: 'Legacy billing cleanup',
              },
            ],
      ),
    )
    const service = createSessionSearchService({
      bootstrap: createBootstrap([
        createSession({
          id: 'old-session',
          title: 'Old work',
          lastActivityAt: '2026-03-24T19:00:00.000Z',
        }),
        createSession({
          id: 'new-session',
          title: 'New work',
          lastActivityAt: '2026-03-24T20:10:00.000Z',
        }),
      ]),
      loadSessionTranscript,
      backgroundHydrationDelayMs: 0,
      hydrationYieldMs: 0,
    })

    expect(service.searchSessions({ query: 'content:auth' }).matches).toEqual([])

    await service.waitForHydration()

    expect(loadSessionTranscript.mock.calls.map(([sessionId]) => sessionId)).toEqual([
      'new-session',
      'old-session',
    ])
    expect(service.searchSessions({ query: 'content:auth tool:edit' }).matches[0]?.sessionId).toBe(
      'new-session',
    )
  })

  it('updates hydrated documents incrementally without rebuilding all search rows per transcript', async () => {
    const { replaceMetadataDocuments, store, upsertDocument } = createRecordingSearchStore()
    const loadSessionTranscript = vi.fn(async (sessionId: string) =>
      createTranscript(sessionId, [
        {
          kind: 'message',
          id: `message-${sessionId}`,
          occurredAt: null,
          role: 'assistant',
          markdown: `Hydrated content for ${sessionId}`,
        },
      ]),
    )

    const service = createSessionSearchService({
      bootstrap: createBootstrap([
        createSession({
          id: 'old-session',
          lastActivityAt: '2026-03-24T19:00:00.000Z',
        }),
        createSession({
          id: 'middle-session',
          lastActivityAt: '2026-03-24T20:00:00.000Z',
        }),
        createSession({
          id: 'new-session',
          lastActivityAt: '2026-03-24T21:00:00.000Z',
        }),
      ]),
      loadSessionTranscript,
      backgroundHydrationDelayMs: 0,
      createSearchStore: () => store,
      hydrationYieldMs: 0,
    })

    await service.waitForHydration()

    expect(replaceMetadataDocuments).toHaveBeenCalledTimes(1)
    expect(upsertDocument.mock.calls.map(([document]) => document.id)).toEqual([
      'new-session',
      'middle-session',
      'old-session',
    ])
  })

  it('defers and limits background transcript hydration so startup remains responsive', async () => {
    vi.useFakeTimers()
    const loadSessionTranscript = vi.fn(async (sessionId: string) =>
      createTranscript(sessionId, [
        {
          kind: 'message',
          id: `message-${sessionId}`,
          occurredAt: null,
          role: 'assistant',
          markdown: `Hydrated content for ${sessionId}`,
        },
      ]),
    )
    const service = createSessionSearchService({
      bootstrap: createBootstrap([
        createSession({
          id: 'old-session',
          lastActivityAt: '2026-03-24T19:00:00.000Z',
        }),
        createSession({
          id: 'middle-session',
          lastActivityAt: '2026-03-24T20:00:00.000Z',
        }),
        createSession({
          id: 'new-session',
          lastActivityAt: '2026-03-24T21:00:00.000Z',
        }),
      ]),
      loadSessionTranscript,
      backgroundHydrationDelayMs: 25,
      backgroundHydrationLimit: 2,
      hydrationYieldMs: 5,
    })

    expect(loadSessionTranscript).not.toHaveBeenCalled()

    await vi.advanceTimersByTimeAsync(24)
    expect(loadSessionTranscript).not.toHaveBeenCalled()

    await vi.advanceTimersByTimeAsync(50)
    await service.waitForHydration()

    expect(loadSessionTranscript.mock.calls.map(([sessionId]) => sessionId)).toEqual([
      'new-session',
      'middle-session',
    ])
  })

  it('hydrates every transcript by default instead of permanently skipping older sessions', async () => {
    const sessions = Array.from({ length: 105 }, (_, index) =>
      createSession({
        id: `session-${String(index).padStart(3, '0')}`,
        lastActivityAt: new Date(Date.UTC(2026, 2, 24, 20, index)).toISOString(),
      }),
    )
    const loadSessionTranscript = vi.fn(async (sessionId: string) =>
      createTranscript(sessionId, [
        {
          kind: 'message',
          id: `message-${sessionId}`,
          occurredAt: null,
          role: 'assistant',
          markdown: `unique searchable content for ${sessionId}`,
        },
      ]),
    )
    const service = createSessionSearchService({
      bootstrap: createBootstrap(sessions),
      loadSessionTranscript,
      backgroundHydrationDelayMs: 0,
      hydrationYieldMs: 0,
    })

    await service.waitForHydration()

    expect(loadSessionTranscript).toHaveBeenCalledTimes(105)
    expect(service.searchSessions({ query: 'content:session-000' }).matches[0]?.sessionId).toBe(
      'session-000',
    )
  })

  it('passes the indexed transcript source path to hydration loaders', async () => {
    const loadSessionTranscript = vi.fn(async (sessionId: string) =>
      createTranscript(sessionId, [
        {
          kind: 'message',
          id: `message-${sessionId}`,
          occurredAt: null,
          role: 'assistant',
          markdown: `Hydrated content for ${sessionId}`,
        },
      ]),
    )
    const service = createSessionSearchService({
      bootstrap: createBootstrap([createSession({ id: 'session-1' })]),
      loadSessionTranscript,
      backgroundHydrationDelayMs: 0,
      hydrationYieldMs: 0,
    })

    await service.waitForHydration()

    expect(loadSessionTranscript).toHaveBeenCalledWith('session-1', '/tmp/session-1.jsonl')
  })

  it('stores hydrated transcript content in a disk-backed SQLite search database', async () => {
    const userDataPath = mkdtempSync(join(tmpdir(), 'oxox-search-'))
    const searchDatabasePath = join(userDataPath, 'session-search.db')
    const service = createSessionSearchService({
      bootstrap: createBootstrap([createSession({ id: 'disk-session' })]),
      loadSessionTranscript: vi.fn(async (sessionId: string) =>
        createTranscript(sessionId, [
          {
            kind: 'message',
            id: `message-${sessionId}`,
            occurredAt: null,
            role: 'assistant',
            markdown: 'persistent sqlite backed search content',
          },
        ]),
      ),
      backgroundHydrationDelayMs: 0,
      hydrationYieldMs: 0,
      searchDatabasePath,
    })

    await service.waitForHydration()

    expect(existsSync(searchDatabasePath)).toBe(true)
    expect(service.searchSessions({ query: 'content:sqlite' }).matches[0]?.sessionId).toBe(
      'disk-session',
    )
    service.dispose()
  })

  it('does not feed hydrated transcript content back into metadata refreshes', async () => {
    const { replaceMetadataDocuments, store } = createRecordingSearchStore()
    const service = createSessionSearchService({
      bootstrap: createBootstrap([createSession({ id: 'session-1', title: 'Initial title' })]),
      loadSessionTranscript: vi.fn(async (sessionId: string) =>
        createTranscript(sessionId, [
          {
            kind: 'message',
            id: `message-${sessionId}`,
            occurredAt: null,
            role: 'assistant',
            markdown: 'large hydrated transcript body',
          },
        ]),
      ),
      backgroundHydrationDelayMs: 0,
      createSearchStore: () => store,
      hydrationYieldMs: 0,
    })

    await service.waitForHydration()
    service.replaceFoundation(
      createBootstrap([createSession({ id: 'session-1', title: 'Updated title' })]),
    )

    const refreshedDocument = replaceMetadataDocuments.mock.calls.at(-1)?.[0][0]
    expect(refreshedDocument).toMatchObject({
      id: 'session-1',
      content: '',
      tool: '',
    })
    service.dispose()
  })

  it('reports background indexing progress while transcript hydration runs', async () => {
    vi.useFakeTimers()
    const loadSessionTranscript = vi.fn(async (sessionId: string) =>
      createTranscript(sessionId, [
        {
          kind: 'message',
          id: `message-${sessionId}`,
          occurredAt: null,
          role: 'assistant',
          markdown: `Hydrated content for ${sessionId}`,
        },
      ]),
    )
    const service = createSessionSearchService({
      bootstrap: createBootstrap([
        createSession({ id: 'old-session', lastActivityAt: '2026-03-24T19:00:00.000Z' }),
        createSession({ id: 'new-session', lastActivityAt: '2026-03-24T21:00:00.000Z' }),
      ]),
      loadSessionTranscript,
      backgroundHydrationDelayMs: 25,
      hydrationYieldMs: 5,
    })

    expect(service.getIndexingProgress()).toEqual(
      expect.objectContaining({
        indexedSessions: 0,
        totalSessions: 2,
        isIndexing: true,
      }),
    )

    await vi.advanceTimersByTimeAsync(25)
    expect(service.getIndexingProgress()).toEqual(
      expect.objectContaining({
        indexedSessions: 1,
        totalSessions: 2,
        isIndexing: true,
      }),
    )

    await vi.advanceTimersByTimeAsync(20)
    await service.waitForHydration()

    expect(service.getIndexingProgress()).toEqual(
      expect.objectContaining({
        indexedSessions: 2,
        totalSessions: 2,
        isIndexing: false,
      }),
    )
  })

  it('keeps indexing progress continuous across foundation refreshes during hydration', async () => {
    vi.useFakeTimers()
    const sessions = [
      createSession({ id: 'session-1', lastActivityAt: '2026-03-24T21:00:00.000Z' }),
      createSession({ id: 'session-2', lastActivityAt: '2026-03-24T20:00:00.000Z' }),
      createSession({ id: 'session-3', lastActivityAt: '2026-03-24T19:00:00.000Z' }),
    ]
    const bootstrap = createBootstrap(sessions)
    const loadSessionTranscript = vi.fn(async (sessionId: string) =>
      createTranscript(sessionId, [
        {
          kind: 'message',
          id: `message-${sessionId}`,
          occurredAt: null,
          role: 'assistant',
          markdown: `Hydrated content for ${sessionId}`,
        },
      ]),
    )
    const service = createSessionSearchService({
      bootstrap,
      loadSessionTranscript,
      backgroundHydrationDelayMs: 0,
      hydrationYieldMs: 100,
    })

    await vi.advanceTimersByTimeAsync(0)
    expect(service.getIndexingProgress()).toEqual(
      expect.objectContaining({
        indexedSessions: 1,
        totalSessions: 3,
        isIndexing: true,
      }),
    )

    service.replaceFoundation(bootstrap)

    expect(service.getIndexingProgress()).toEqual(
      expect.objectContaining({
        indexedSessions: 1,
        totalSessions: 3,
        isIndexing: true,
      }),
    )
  })

  it('does not start a competing hydration pass when foundation changes mid-index', async () => {
    vi.useFakeTimers()
    const bootstrap = createBootstrap([
      createSession({ id: 'session-1', lastActivityAt: '2026-03-24T21:00:00.000Z' }),
      createSession({ id: 'session-2', lastActivityAt: '2026-03-24T20:00:00.000Z' }),
      createSession({ id: 'session-3', lastActivityAt: '2026-03-24T19:00:00.000Z' }),
    ])
    const loadSessionTranscript = vi.fn(async (sessionId: string) =>
      createTranscript(sessionId, [
        {
          kind: 'message',
          id: `message-${sessionId}`,
          occurredAt: null,
          role: 'assistant',
          markdown: `Hydrated content for ${sessionId}`,
        },
      ]),
    )
    const service = createSessionSearchService({
      bootstrap,
      loadSessionTranscript,
      backgroundHydrationDelayMs: 0,
      hydrationYieldMs: 100,
    })

    await vi.advanceTimersByTimeAsync(0)
    expect(loadSessionTranscript.mock.calls.map(([sessionId]) => sessionId)).toEqual(['session-1'])

    service.replaceFoundation(bootstrap)
    await vi.advanceTimersByTimeAsync(0)

    expect(loadSessionTranscript.mock.calls.map(([sessionId]) => sessionId)).toEqual(['session-1'])

    await vi.advanceTimersByTimeAsync(100)

    expect(loadSessionTranscript.mock.calls.map(([sessionId]) => sessionId)).toEqual([
      'session-1',
      'session-2',
    ])
  })

  it('caps indexed transcript fields to avoid tokenizing huge session artifacts', async () => {
    const largeMessage = `${'alpha '.repeat(30)}needle ${'omega '.repeat(30)}`
    const loadSessionTranscript = vi.fn(async (sessionId: string) =>
      createTranscript(sessionId, [
        {
          kind: 'message',
          id: `message-${sessionId}`,
          occurredAt: null,
          role: 'assistant',
          markdown: largeMessage,
        },
        {
          kind: 'tool_call',
          id: `tool-${sessionId}`,
          toolUseId: `tool-${sessionId}`,
          occurredAt: null,
          toolName: 'Edit',
          status: 'completed',
          inputMarkdown: 'input '.repeat(30),
          resultMarkdown: 'result '.repeat(30),
          resultIsError: false,
        },
      ]),
    )
    const { store, upsertDocument } = createRecordingSearchStore()
    const service = createSessionSearchService({
      bootstrap: createBootstrap([createSession({ id: 'big-session' })]),
      loadSessionTranscript,
      backgroundHydrationDelayMs: 0,
      createSearchStore: () => store,
      hydrationYieldMs: 0,
      maxIndexedContentChars: 40,
      maxIndexedToolChars: 24,
    })

    await service.waitForHydration()

    const indexedDocument = upsertDocument.mock.calls[0]?.[0]
    expect(indexedDocument.content.length).toBeLessThanOrEqual(40)
    expect(indexedDocument.tool.length).toBeLessThanOrEqual(24)
  })

  it('applies AND semantics across free text and modifiers', async () => {
    const service = createSessionSearchService({
      bootstrap: createBootstrap([
        createSession({
          id: 'matching',
          title: 'SDK authentication',
          projectDisplayName: 'Awesome',
          projectWorkspacePath: '/repo/awesome',
          status: 'completed',
        }),
        createSession({
          id: 'wrong-status',
          title: 'SDK authentication',
          projectDisplayName: 'Awesome',
          projectWorkspacePath: '/repo/awesome',
          status: 'active',
        }),
      ]),
      loadSessionTranscript: vi.fn(async (sessionId: string) =>
        createTranscript(sessionId, [
          {
            kind: 'message',
            id: `message-${sessionId}`,
            occurredAt: null,
            role: 'assistant',
            markdown: sessionId === 'matching' ? 'Login token flow' : 'Login token flow',
          },
        ]),
      ),
      backgroundHydrationDelayMs: 0,
      hydrationYieldMs: 0,
    })

    await service.waitForHydration()

    expect(
      service
        .searchSessions({
          query: 'sdk content:token project:awesome path:/repo status:completed',
        })
        .matches.map((match) => match.sessionId),
    ).toEqual(['matching'])
  })

  it('rebuilds metadata and removes deleted sessions when foundation data changes', () => {
    const service = createSessionSearchService({
      bootstrap: createBootstrap([
        createSession({ id: 'session-1', title: 'Old title' }),
        createSession({ id: 'session-2', title: 'Remove me' }),
      ]),
      loadSessionTranscript: vi.fn(),
    })

    service.replaceFoundation(
      createBootstrap([createSession({ id: 'session-1', title: 'Renamed SDK title' })]),
    )

    expect(
      service.searchSessions({ query: 'sdk' }).matches.map((match) => match.sessionId),
    ).toEqual(['session-1'])
    expect(service.searchSessions({ query: 'remove' }).matches).toEqual([])
  })

  it('debounces live snapshot indexing and uses the latest snapshot content', async () => {
    vi.useFakeTimers()
    const service = createSessionSearchService({
      bootstrap: createBootstrap([createSession({ id: 'live-session', title: 'Live shell' })]),
      loadSessionTranscript: vi.fn(),
      liveUpdateDebounceMs: 25,
    })

    service.scheduleLiveSnapshotUpdate(
      createLiveSnapshot({
        sessionId: 'live-session',
        messages: [{ id: 'm1', role: 'assistant', content: 'outdated content' }],
      }),
    )
    service.scheduleLiveSnapshotUpdate(
      createLiveSnapshot({
        sessionId: 'live-session',
        messages: [{ id: 'm2', role: 'assistant', content: 'fresh websocket auth content' }],
        events: [
          {
            type: 'tool.result',
            sessionId: 'live-session',
            toolUseId: 'tool-1',
            toolName: 'Read',
            content: 'fresh tool output',
          },
        ],
      }),
    )

    await vi.advanceTimersByTimeAsync(24)
    expect(service.searchSessions({ query: 'websocket' }).matches).toEqual([])

    await vi.advanceTimersByTimeAsync(1)

    expect(
      service.searchSessions({ query: 'content:websocket tool:read' }).matches[0]?.sessionId,
    ).toBe('live-session')
    vi.useRealTimers()
  })
})
