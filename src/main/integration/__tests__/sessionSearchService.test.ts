import { existsSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'

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
  sourceRecords: unknown[] = [],
  overrides: Record<string, unknown> = {},
): SessionTranscript {
  return {
    sessionId,
    sourcePath: `/tmp/${sessionId}.jsonl`,
    loadedAt: '2026-03-24T20:06:00.000Z',
    entries,
    sourceRecords,
    ...overrides,
  } as SessionTranscript
}

function createSourceRecord(overrides: {
  lineNo: number
  byteOffset: number
  byteLength: number
  recordId: string
  recordType?: string
  rawHash?: string
  timestamp?: string | null
}) {
  return {
    lineNo: overrides.lineNo,
    byteOffset: overrides.byteOffset,
    byteLength: overrides.byteLength,
    rawHash: overrides.rawHash ?? `${overrides.recordId}-hash`,
    recordId: overrides.recordId,
    type: overrides.recordType ?? 'message',
    recordType: overrides.recordType ?? 'message',
    timestamp: overrides.timestamp ?? '2026-03-24T20:00:00.000Z',
    parentRecordId: null,
    compactionSummaryId: null,
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
  const deleteSession = vi.fn((sessionId: string) => {
    documents.delete(sessionId)
  })
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
    deleteSession,
    replaceMetadataDocuments,
    upsertDocument,
    searchDocuments,
  }

  return { deleteSession, store, replaceMetadataDocuments, upsertDocument }
}

describe('createSessionSearchService', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('deletes a session from metadata and the backing search store', async () => {
    const { deleteSession, store } = createRecordingSearchStore()
    const service = createSessionSearchService({
      bootstrap: createBootstrap([
        createSession({ id: 'keep-session', title: 'Keep alpha' }),
        createSession({ id: 'delete-session', title: 'Delete beta' }),
      ]),
      createSearchStore: () => store,
      loadSessionTranscript: vi.fn(async (sessionId: string) =>
        createTranscript(sessionId, [
          {
            kind: 'message',
            id: `${sessionId}:message`,
            sourceMessageId: `${sessionId}:message`,
            role: 'assistant',
            text: sessionId === 'delete-session' ? 'unique deleted content' : 'kept content',
            contentBlocks: [{ type: 'text', text: 'content' }],
          },
        ]),
      ),
      backgroundHydrationDelayMs: 0,
      hydrationYieldMs: 0,
    })

    await service.waitForHydration()
    expect(service.searchSessions({ query: 'beta' }).matches[0]?.sessionId).toBe('delete-session')

    service.deleteSession('delete-session')

    expect(deleteSession).toHaveBeenCalledWith('delete-session')
    expect(service.searchSessions({ query: 'beta' }).matches).toEqual([])
    expect(service.searchSessions({ query: 'alpha' }).matches[0]?.sessionId).toBe('keep-session')
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

  it('indexes daemon-only session metadata without transcript hydration', async () => {
    const daemonSession = createSession({
      id: 'daemon-only',
      title: 'Remote daemon investigation',
      projectWorkspacePath: '/tmp/remote-workspace',
      status: 'active',
      transport: 'daemon',
    })
    const loadSessionTranscript = vi.fn()
    const service = createSessionSearchService({
      bootstrap: {
        ...createBootstrap([daemonSession]),
        syncMetadata: [],
      },
      loadSessionTranscript,
      backgroundHydrationDelayMs: 0,
      hydrationYieldMs: 0,
    })

    expect(service.searchSessions({ query: 'remote status:active' }).matches[0]?.sessionId).toBe(
      'daemon-only',
    )

    await service.waitForHydration()

    expect(loadSessionTranscript).not.toHaveBeenCalled()
    expect(service.getIndexingProgress()).toMatchObject({
      indexedSessions: 0,
      totalSessions: 0,
      isIndexing: false,
    })
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

  it('can refresh in-memory foundation metadata without writing the search database', () => {
    const { replaceMetadataDocuments, store } = createRecordingSearchStore()
    const service = createSessionSearchService({
      bootstrap: createBootstrap([createSession({ id: 'session-alpha', title: 'Alpha' })]),
      createSearchStore: () => store,
      loadSessionTranscript: vi.fn(),
      backgroundHydrationLimit: 0,
    })

    expect(replaceMetadataDocuments).toHaveBeenCalledTimes(1)

    service.replaceFoundation(
      createBootstrap([createSession({ id: 'session-alpha', title: 'Alpha renamed' })]),
      {
        persistMetadata: false,
        scheduleHydration: false,
      },
    )

    expect(replaceMetadataDocuments).toHaveBeenCalledTimes(1)
    expect(service.searchSessions({ query: 'alpha' }).matches[0]?.sessionId).toBe('session-alpha')
  })

  it('uses background hydration limits as continuing work windows and reports total progress', async () => {
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

    expect(service.getIndexingProgress()).toEqual(
      expect.objectContaining({
        indexedSessions: 0,
        totalSessions: 3,
        isIndexing: true,
      }),
    )

    expect(loadSessionTranscript).not.toHaveBeenCalled()

    await vi.advanceTimersByTimeAsync(24)
    expect(loadSessionTranscript).not.toHaveBeenCalled()

    await vi.advanceTimersByTimeAsync(50)
    await service.waitForHydration()

    expect(loadSessionTranscript.mock.calls.map(([sessionId]) => sessionId)).toEqual([
      'new-session',
      'middle-session',
      'old-session',
    ])
    expect(service.getIndexingProgress()).toEqual(
      expect.objectContaining({
        indexedSessions: 3,
        totalSessions: 3,
        isIndexing: false,
      }),
    )
  })

  it('pauses between background indexing batches when a batch throttle is configured', async () => {
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
        createSession({ id: 'session-1' }),
        createSession({ id: 'session-2' }),
        createSession({ id: 'session-3' }),
      ]),
      loadSessionTranscript,
      backgroundHydrationBatchDelayMs: 100,
      backgroundHydrationBatchSize: 1,
      backgroundHydrationDelayMs: 0,
      hydrationYieldMs: 0,
    })

    await vi.advanceTimersByTimeAsync(0)
    expect(loadSessionTranscript).toHaveBeenCalledTimes(1)

    await vi.advanceTimersByTimeAsync(99)
    expect(loadSessionTranscript).toHaveBeenCalledTimes(1)

    await vi.advanceTimersByTimeAsync(1)
    expect(loadSessionTranscript).toHaveBeenCalledTimes(2)

    await vi.advanceTimersByTimeAsync(100)
    await service.waitForHydration()

    expect(loadSessionTranscript).toHaveBeenCalledTimes(3)
  })

  it('caps fragment rows per hydrated session when configured', async () => {
    const service = createSessionSearchService({
      bootstrap: createBootstrap([createSession({ id: 'capped-session' })]),
      loadSessionTranscript: vi.fn(async (sessionId: string) =>
        createTranscript(sessionId, [
          {
            kind: 'message',
            id: 'message-1',
            occurredAt: null,
            role: 'assistant',
            markdown: 'first indexed fragment',
          },
          {
            kind: 'message',
            id: 'message-2',
            occurredAt: null,
            role: 'assistant',
            markdown: 'second indexed fragment',
          },
          {
            kind: 'message',
            id: 'message-3',
            occurredAt: null,
            role: 'assistant',
            markdown: 'third skipped fragment',
          },
        ]),
      ),
      backgroundHydrationDelayMs: 0,
      hydrationYieldMs: 0,
      maxIndexedContentChars: 1,
      maxIndexedFragmentsPerSession: 2,
    })

    await service.waitForHydration()
    expect(service.searchSessions({ query: 'content:first' }).matches[0]?.sessionId).toBe(
      'capped-session',
    )
    expect(service.searchSessions({ query: 'content:second' }).matches[0]?.sessionId).toBe(
      'capped-session',
    )
    expect(service.searchSessions({ query: 'content:third' }).matches).toEqual([])
  })

  it('returns flat hits for repeated extensionless path matches in one session', async () => {
    const searchedPath = '/var/run/argo/ctr/ecs-deploy/combined'
    const fillerEntries: SessionTranscript['entries'] = Array.from({ length: 620 }, (_, index) => ({
      kind: 'message',
      id: `filler-${index}`,
      occurredAt: null,
      role: 'assistant',
      markdown: `unrelated hydration filler ${index}`,
    }))
    const targetEntries: SessionTranscript['entries'] = Array.from({ length: 10 }, (_, index) => ({
      kind: 'tool_call',
      toolUseId: `tool-${index}`,
      occurredAt: `2026-03-24T20:${String(index).padStart(2, '0')}:00.000Z`,
      toolName: 'Execute',
      inputMarkdown: `{"command":"cat ${searchedPath}"}`,
      resultMarkdown: `workflow_stage ecs-deploy path = "${searchedPath}" result ${index}`,
      resultIsError: false,
      status: 'completed',
    }))
    const service = createSessionSearchService({
      bootstrap: createBootstrap([createSession({ id: 'path-session' })]),
      loadSessionTranscript: vi.fn(async (sessionId: string) =>
        createTranscript(sessionId, [...fillerEntries, ...targetEntries]),
      ),
      backgroundHydrationDelayMs: 0,
      hydrationYieldMs: 0,
    })

    await service.waitForHydration()

    const response = service.searchSessions({ query: searchedPath, limit: 20 })

    expect(response.hits?.length).toBeGreaterThanOrEqual(10)
    expect(response.matches).toHaveLength(1)
    expect(response.matches[0]).toMatchObject({
      hitCount: expect.any(Number),
      sessionId: 'path-session',
    })
    expect(response.matches[0]?.hitCount ?? 0).toBeGreaterThanOrEqual(10)
  })

  it('indexes late path-like Execute output lines in tool calls and tool results', async () => {
    const searchedPath = '/var/run/argo/ctr/ecs-deploy/combined'
    const resultMarkdown = Array.from(
      { length: 20 },
      (_, index) => `/var/run/argo/ctr/other-stage-${index}/combined`,
    )
      .concat([searchedPath])
      .join('\n')
    const service = createSessionSearchService({
      bootstrap: createBootstrap([createSession({ id: 'late-output-session' })]),
      loadSessionTranscript: vi.fn(async (sessionId: string) =>
        createTranscript(sessionId, [
          {
            kind: 'tool_call',
            toolUseId: 'tool-execute',
            occurredAt: null,
            toolName: 'Execute',
            inputMarkdown: '{"command":"cat /tmp/build.log"}',
            resultMarkdown,
            resultIsError: false,
            status: 'completed',
          },
        ]),
      ),
      backgroundHydrationDelayMs: 0,
      hydrationYieldMs: 0,
    })

    await service.waitForHydration()

    const response = service.searchSessions({ query: searchedPath, limit: 10 })
    const sourceKinds = new Set(response.hits?.map((hit) => hit.reason.sourceKind))

    expect(sourceKinds.has('tool_call')).toBe(true)
    expect(sourceKinds.has('tool_result')).toBe(true)
  })

  it('diversifies flat hits across sessions before repeating one session', async () => {
    const searchedPath = '/var/run/argo/ctr/ecs-deploy/combined'
    const service = createSessionSearchService({
      bootstrap: createBootstrap([
        createSession({ id: 'session-a', lastActivityAt: '2026-03-24T20:10:00.000Z' }),
        createSession({ id: 'session-b', lastActivityAt: '2026-03-24T20:09:00.000Z' }),
        createSession({ id: 'session-c', lastActivityAt: '2026-03-24T20:08:00.000Z' }),
      ]),
      loadSessionTranscript: vi.fn(async (sessionId: string) => {
        const count = sessionId === 'session-a' ? 12 : 1

        return createTranscript(
          sessionId,
          Array.from({ length: count }, (_, index) => ({
            kind: 'tool_call',
            toolUseId: `${sessionId}-tool-${index}`,
            occurredAt: `2026-03-24T20:${String(index).padStart(2, '0')}:00.000Z`,
            toolName: 'Execute',
            inputMarkdown: `{"command":"cat ${searchedPath}"}`,
            resultMarkdown: `deployment output ${searchedPath} ${sessionId} ${index}`,
            resultIsError: false,
            status: 'completed',
          })),
        )
      }),
      backgroundHydrationDelayMs: 0,
      hydrationYieldMs: 0,
    })

    await service.waitForHydration()

    const response = service.searchSessions({ query: searchedPath, limit: 3 })

    expect(new Set(response.hits?.map((hit) => hit.sessionId))).toEqual(
      new Set(['session-a', 'session-b', 'session-c']),
    )
    expect(response.matches.map((match) => match.sessionId)).toEqual([
      'session-a',
      'session-b',
      'session-c',
    ])
  })

  it('matches free-text terms across separate fragments in the same session', async () => {
    const service = createSessionSearchService({
      bootstrap: createBootstrap([
        createSession({
          id: 'awesome-cli-session',
          title: 'Release packaging work',
          lastActivityAt: '2026-03-24T20:10:00.000Z',
        }),
      ]),
      loadSessionTranscript: vi.fn(async (sessionId: string) =>
        createTranscript(sessionId, [
          {
            kind: 'message',
            id: 'message-cli',
            occurredAt: null,
            role: 'user',
            markdown: 'Awesome CLI release and installer planning.',
          },
          {
            kind: 'message',
            id: 'message-windows',
            occurredAt: null,
            role: 'assistant',
            markdown: 'Implemented the Windows distributable build and PowerShell install script.',
          },
        ]),
      ),
      backgroundHydrationDelayMs: 0,
      hydrationYieldMs: 0,
      maxIndexedContentChars: 20,
    })

    await service.waitForHydration()

    expect(
      service.searchSessions({ query: 'windows cli', limit: 80 }).matches.map((m) => m.sessionId),
    ).toContain('awesome-cli-session')

    service.dispose()
  })

  it('matches hyphenated query tokens against split words without weakening issue keys', async () => {
    const service = createSessionSearchService({
      bootstrap: createBootstrap([createSession({ id: 'split-awesome-cli-session' })]),
      loadSessionTranscript: vi.fn(async (sessionId: string) =>
        createTranscript(sessionId, [
          {
            kind: 'message',
            id: 'message-1',
            occurredAt: null,
            role: 'assistant',
            markdown: 'Awesome CLI Windows installer support shipped.',
          },
        ]),
      ),
      backgroundHydrationDelayMs: 0,
      hydrationYieldMs: 0,
    })

    await service.waitForHydration()

    expect(
      service
        .searchSessions({ query: 'awesome-cli windows', limit: 80 })
        .matches.map((m) => m.sessionId),
    ).toContain('split-awesome-cli-session')

    service.dispose()
  })

  it('caps hydrated tool text before storing searchable document fields', async () => {
    const { store, upsertDocument } = createRecordingSearchStore()
    const hugeToolResult = `${'diagnostic '.repeat(10_000)} uncapped-tail`
    const service = createSessionSearchService({
      bootstrap: createBootstrap([createSession({ id: 'huge-tool-session' })]),
      createSearchStore: () => store,
      loadSessionTranscript: vi.fn(async (sessionId: string) =>
        createTranscript(sessionId, [
          {
            kind: 'tool_call',
            toolUseId: 'tool-1',
            toolName: 'Execute',
            inputMarkdown: 'pnpm test',
            resultMarkdown: hugeToolResult,
            resultIsError: false,
            status: 'completed',
            occurredAt: null,
          },
        ]),
      ),
      backgroundHydrationDelayMs: 0,
      hydrationYieldMs: 0,
      maxIndexedToolChars: 32,
    })

    await service.waitForHydration()

    const indexedDocument = upsertDocument.mock.calls.at(-1)?.[0]
    const match = service.searchSessions({ query: 'tool:diagnostic' }).matches[0]
    expect(match?.sessionId).toBe('huge-tool-session')
    expect(indexedDocument?.tool.length).toBeLessThanOrEqual(32)
    expect(service.searchSessions({ query: 'tool:uncapped-tail' }).matches).toEqual([])
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

    expect(loadSessionTranscript).toHaveBeenCalledWith('session-1', '/tmp/session-1.jsonl', {
      startLineNo: 1,
      startOffset: 0,
    })
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

  it('persists fragment search rows and FTS indexes in the disk-backed search database', async () => {
    const userDataPath = mkdtempSync(join(tmpdir(), 'oxox-search-schema-'))
    const searchDatabasePath = join(userDataPath, 'session-search.db')
    const bootstrap = createBootstrap([createSession({ id: 'schema-session' })])
    const service = createSessionSearchService({
      bootstrap,
      loadSessionTranscript: vi.fn(async (sessionId: string) =>
        createTranscript(sessionId, [
          {
            kind: 'message',
            id: `message-${sessionId}`,
            sourceMessageId: `message-${sessionId}`,
            occurredAt: null,
            role: 'assistant',
            markdown: 'fragment table smoke test',
          },
        ]),
      ),
      backgroundHydrationDelayMs: 0,
      hydrationYieldMs: 0,
      searchDatabasePath,
    })

    await service.waitForHydration()
    service.dispose()

    const restartedService = createSessionSearchService({
      bootstrap: createBootstrap([createSession({ id: 'schema-session' })]),
      loadSessionTranscript: vi.fn(async (sessionId: string) =>
        createTranscript(sessionId, [
          {
            kind: 'message',
            id: `message-${sessionId}`,
            sourceMessageId: `message-${sessionId}`,
            occurredAt: null,
            role: 'assistant',
            markdown: 'fragment table smoke test',
          },
        ]),
      ),
      backgroundHydrationDelayMs: 0,
      hydrationYieldMs: 0,
      searchDatabasePath,
    })

    expect(restartedService.searchSessions({ query: 'content:smoke' }).matches[0]).toMatchObject({
      sessionId: 'schema-session',
      reasons: expect.arrayContaining([expect.objectContaining({ sourceKind: 'block' })]),
    })
    restartedService.dispose()
  })

  it('returns native FTS snippets for fragment content matches', async () => {
    const userDataPath = mkdtempSync(join(tmpdir(), 'oxox-search-snippet-'))
    const searchDatabasePath = join(userDataPath, 'session-search.db')
    const prefix = Array.from({ length: 40 }, (_, index) => `prefix${index}`).join(' ')
    const suffix = Array.from({ length: 40 }, (_, index) => `suffix${index}`).join(' ')
    const service = createSessionSearchService({
      bootstrap: createBootstrap([createSession({ id: 'snippet-session' })]),
      loadSessionTranscript: vi.fn(async (sessionId: string) =>
        createTranscript(sessionId, [
          {
            kind: 'message',
            id: 'message-snippet',
            sourceMessageId: 'message-snippet',
            occurredAt: null,
            role: 'assistant',
            markdown: `${prefix} precise needle phrase ${suffix}`,
          },
        ]),
      ),
      backgroundHydrationDelayMs: 0,
      hydrationYieldMs: 0,
      searchDatabasePath,
    })

    await service.waitForHydration()

    const reason = service.searchSessions({ query: 'content:needle' }).matches[0]?.reasons[0]

    expect(reason).toMatchObject({
      field: 'content',
      sourceId: 'message-snippet',
      sourceKind: 'block',
    })
    expect(reason?.snippet).toContain('needle')
    expect(reason?.snippet).not.toContain('prefix0')
    service.dispose()
  })

  it('persists transcript source offsets and rehydrates stale artifact sources safely', async () => {
    const userDataPath = mkdtempSync(join(tmpdir(), 'oxox-search-source-'))
    const searchDatabasePath = join(userDataPath, 'session-search.db')
    const firstBootstrap = createBootstrap([createSession({ id: 'source-session' })])
    firstBootstrap.syncMetadata = [
      {
        sourcePath: '/tmp/source-session.jsonl',
        sessionId: 'source-session',
        lastByteOffset: 120,
        lastMtimeMs: 1_000,
        lastSyncedAt: '2026-03-24T20:05:00.000Z',
        checksum: 'checksum-1',
      },
    ]
    const firstService = createSessionSearchService({
      bootstrap: firstBootstrap,
      loadSessionTranscript: vi.fn(async (sessionId: string) =>
        createTranscript(
          sessionId,
          [
            {
              kind: 'message',
              id: 'message-old',
              sourceMessageId: 'message-old',
              occurredAt: null,
              role: 'assistant',
              markdown: 'old indexed source content',
            },
          ],
          [
            createSourceRecord({
              lineNo: 1,
              byteOffset: 0,
              byteLength: 120,
              recordId: 'message-old',
              rawHash: 'old-hash',
            }),
          ],
        ),
      ),
      backgroundHydrationDelayMs: 0,
      hydrationYieldMs: 0,
      searchDatabasePath,
    })

    await firstService.waitForHydration()
    firstService.dispose()

    const freshLoader = vi.fn(async () => createTranscript('source-session', []))
    const freshRestart = createSessionSearchService({
      bootstrap: firstBootstrap,
      loadSessionTranscript: freshLoader,
      backgroundHydrationDelayMs: 0,
      hydrationYieldMs: 0,
      searchDatabasePath,
    })

    await freshRestart.waitForHydration()

    expect(freshLoader).not.toHaveBeenCalled()
    freshRestart.dispose()

    const nextBootstrap = createBootstrap([createSession({ id: 'source-session' })])
    nextBootstrap.syncMetadata = [
      {
        sourcePath: '/tmp/source-session.jsonl',
        sessionId: 'source-session',
        lastByteOffset: 240,
        lastMtimeMs: 2_000,
        lastSyncedAt: '2026-03-24T20:06:00.000Z',
        checksum: 'checksum-2',
      },
    ]
    const loadUpdatedTranscript = vi.fn(async (sessionId: string) =>
      createTranscript(
        sessionId,
        [
          {
            kind: 'message',
            id: 'message-new',
            sourceMessageId: 'message-new',
            occurredAt: null,
            role: 'assistant',
            markdown: 'fresh appended source needle',
          },
        ],
        [
          createSourceRecord({
            lineNo: 2,
            byteOffset: 120,
            byteLength: 120,
            recordId: 'message-new',
            rawHash: 'new-hash',
          }),
        ],
      ),
    )
    const restartedService = createSessionSearchService({
      bootstrap: nextBootstrap,
      loadSessionTranscript: loadUpdatedTranscript,
      backgroundHydrationDelayMs: 0,
      hydrationYieldMs: 0,
      searchDatabasePath,
    })

    await restartedService.waitForHydration()

    expect(loadUpdatedTranscript).toHaveBeenCalledTimes(1)
    expect(loadUpdatedTranscript).toHaveBeenCalledWith(
      'source-session',
      '/tmp/source-session.jsonl',
      {
        startLineNo: 2,
        startOffset: 120,
      },
    )
    expect(restartedService.searchSessions({ query: 'content:old' }).matches[0]).toMatchObject({
      sessionId: 'source-session',
      reasons: expect.arrayContaining([expect.objectContaining({ sourceId: 'message-old' })]),
    })
    expect(restartedService.searchSessions({ query: 'content:needle' }).matches[0]).toMatchObject({
      sessionId: 'source-session',
      reasons: expect.arrayContaining([expect.objectContaining({ sourceId: 'message-new' })]),
    })
    restartedService.dispose()
  })

  it('purges indexed fragments and rebuilds when a transcript source shrinks', async () => {
    const userDataPath = mkdtempSync(join(tmpdir(), 'oxox-search-shrink-'))
    const searchDatabasePath = join(userDataPath, 'session-search.db')
    const firstBootstrap = createBootstrap([createSession({ id: 'shrink-session' })])
    firstBootstrap.syncMetadata = [
      {
        sourcePath: '/tmp/shrink-session.jsonl',
        sessionId: 'shrink-session',
        lastByteOffset: 240,
        lastMtimeMs: 1_000,
        lastSyncedAt: '2026-03-24T20:05:00.000Z',
        checksum: 'checksum-large',
      },
    ]
    const firstService = createSessionSearchService({
      bootstrap: firstBootstrap,
      loadSessionTranscript: vi.fn(async (sessionId: string) =>
        createTranscript(
          sessionId,
          [
            {
              kind: 'message',
              id: 'message-large',
              sourceMessageId: 'message-large',
              occurredAt: null,
              role: 'assistant',
              markdown: 'large stale source content',
            },
          ],
          [
            createSourceRecord({
              lineNo: 1,
              byteOffset: 0,
              byteLength: 240,
              recordId: 'message-large',
              rawHash: 'large-hash',
            }),
          ],
        ),
      ),
      backgroundHydrationDelayMs: 0,
      hydrationYieldMs: 0,
      searchDatabasePath,
    })

    await firstService.waitForHydration()
    firstService.dispose()

    const nextBootstrap = createBootstrap([createSession({ id: 'shrink-session' })])
    nextBootstrap.syncMetadata = [
      {
        sourcePath: '/tmp/shrink-session.jsonl',
        sessionId: 'shrink-session',
        lastByteOffset: 80,
        lastMtimeMs: 2_000,
        lastSyncedAt: '2026-03-24T20:06:00.000Z',
        checksum: 'checksum-small',
      },
    ]
    const loadShrunkTranscript = vi.fn(async (sessionId: string) =>
      createTranscript(
        sessionId,
        [
          {
            kind: 'message',
            id: 'message-small',
            sourceMessageId: 'message-small',
            occurredAt: null,
            role: 'assistant',
            markdown: 'replacement compact source content',
          },
        ],
        [
          createSourceRecord({
            lineNo: 1,
            byteOffset: 0,
            byteLength: 80,
            recordId: 'message-small',
            rawHash: 'small-hash',
          }),
        ],
      ),
    )
    const restartedService = createSessionSearchService({
      bootstrap: nextBootstrap,
      loadSessionTranscript: loadShrunkTranscript,
      backgroundHydrationDelayMs: 0,
      hydrationYieldMs: 0,
      searchDatabasePath,
    })

    await restartedService.waitForHydration()

    expect(loadShrunkTranscript).toHaveBeenCalledWith(
      'shrink-session',
      '/tmp/shrink-session.jsonl',
      {
        startLineNo: 1,
        startOffset: 0,
      },
    )
    expect(restartedService.searchSessions({ query: 'content:stale' }).matches).toEqual([])
    expect(restartedService.searchSessions({ query: 'content:compact' }).matches[0]).toMatchObject({
      sessionId: 'shrink-session',
      reasons: expect.arrayContaining([expect.objectContaining({ sourceId: 'message-small' })]),
    })
    restartedService.dispose()
  })

  it('drops a stale derived search cache and rebuilds it from transcript artifacts', async () => {
    const userDataPath = mkdtempSync(join(tmpdir(), 'oxox-search-stale-cache-'))
    const searchDatabasePath = join(userDataPath, 'session-search.db')
    const database = new DatabaseSync(searchDatabasePath)
    database.exec(`
      CREATE TABLE session_search_documents (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        project TEXT NOT NULL,
        path TEXT NOT NULL,
        status TEXT NOT NULL,
        session_id TEXT NOT NULL,
        content TEXT NOT NULL DEFAULT '',
        tool TEXT NOT NULL DEFAULT '',
        last_activity_at INTEGER NOT NULL DEFAULT 0,
        transcript_source_path TEXT,
        source_last_byte_offset INTEGER NOT NULL DEFAULT -1,
        source_last_mtime_ms INTEGER NOT NULL DEFAULT 0,
        source_checksum TEXT
      );
      INSERT INTO session_search_documents (
        id,
        title,
        project,
        path,
        status,
        session_id,
        content,
        tool,
        last_activity_at,
        transcript_source_path,
        source_last_byte_offset,
        source_last_mtime_ms,
        source_checksum
      )
      VALUES (
        'stale-cache-session',
        'Stale cache',
        'project-stale-cache-session',
        '/tmp/stale-cache-session',
        'completed',
        'stale-cache-session',
        'stale-only content',
        '',
        1,
        '/tmp/stale-cache-session.jsonl',
        120,
        1000,
        'stale-checksum'
      );
    `)
    database.close()

    const bootstrap = createBootstrap([createSession({ id: 'stale-cache-session' })])
    bootstrap.syncMetadata = [
      {
        sourcePath: '/tmp/stale-cache-session.jsonl',
        sessionId: 'stale-cache-session',
        lastByteOffset: 240,
        lastMtimeMs: 2_000,
        lastSyncedAt: '2026-03-24T20:06:00.000Z',
        checksum: 'rebuilt-checksum',
      },
    ]
    const loadSessionTranscript = vi.fn(async (sessionId: string) =>
      createTranscript(sessionId, [
        {
          kind: 'message',
          id: 'message-rebuilt',
          sourceMessageId: 'message-rebuilt',
          occurredAt: null,
          role: 'assistant',
          markdown: 'rebuilt source content',
        },
      ]),
    )
    const service = createSessionSearchService({
      bootstrap,
      loadSessionTranscript,
      backgroundHydrationDelayMs: 0,
      hydrationYieldMs: 0,
      searchDatabasePath,
    })

    await service.waitForHydration()

    expect(loadSessionTranscript).toHaveBeenCalledTimes(1)
    expect(service.searchSessions({ query: 'content:stale-only' }).matches).toEqual([])
    expect(service.searchSessions({ query: 'content:rebuilt' }).matches[0]).toMatchObject({
      sessionId: 'stale-cache-session',
    })
    service.dispose()
  })

  it('persists OXO-58 entity fragments for exact file, command, issue, error, todo, compaction, and settings queries', async () => {
    const userDataPath = mkdtempSync(join(tmpdir(), 'oxox-search-entities-'))
    const searchDatabasePath = join(userDataPath, 'session-search.db')
    const bootstrap = createBootstrap([createSession({ id: 'entity-session' })])
    const service = createSessionSearchService({
      bootstrap,
      loadSessionTranscript: vi.fn(async (sessionId: string) =>
        createTranscript(
          sessionId,
          [
            {
              kind: 'tool_call',
              id: 'tool-execute',
              toolUseId: 'tool-execute',
              occurredAt: '2026-06-11T10:00:00.000Z',
              toolName: 'Execute',
              status: 'failed',
              inputMarkdown: 'pnpm test --filter daemon/transport.ts',
              resultMarkdown: 'FAIL daemon/transport.ts ResizeObserver is not defined',
              resultIsError: true,
            },
          ],
          [
            {
              ...createSourceRecord({
                lineNo: 1,
                byteOffset: 0,
                byteLength: 100,
                recordId: 'todo-record',
                recordType: 'todo_state',
                rawHash: 'todo-hash',
              }),
              payload: {
                todos: [{ content: 'todo: fix OXO-41 contracts.ts search', status: 'pending' }],
              },
              type: 'todo_state',
            },
            {
              ...createSourceRecord({
                lineNo: 2,
                byteOffset: 100,
                byteLength: 200,
                recordId: 'summary-record',
                recordType: 'compaction_state',
                rawHash: 'summary-hash',
              }),
              compactionSummaryId: 'summary-1',
              payload: {
                summary: {
                  id: 'summary-1',
                  text: 'Remember OXO-41 and contracts.ts search ranking.',
                },
              },
              type: 'compaction_state',
            },
          ],
          {
            settings: {
              modelId: 'claude-opus-4-6',
              reasoningEffort: 'high',
            },
            snapshots: [
              {
                contentHash: 'snapshot-hash',
                filePath: '/repo/src/shared/ipc/contracts.ts',
                messageId: 'message-1',
                sizeBytes: 4096,
                toolCallId: 'tool-execute',
              },
            ],
          },
        ),
      ),
      backgroundHydrationDelayMs: 0,
      hydrationYieldMs: 0,
      searchDatabasePath,
    })

    await service.waitForHydration()

    expect(service.searchSessions({ query: 'content:ResizeObserver' }).matches[0]).toMatchObject({
      sessionId: 'entity-session',
      reasons: expect.arrayContaining([
        expect.objectContaining({ sourceKind: 'tool_call', sourceId: 'tool-execute' }),
      ]),
    })
    expect(service.searchSessions({ query: 'path:contracts.ts' }).matches[0]).toMatchObject({
      sessionId: 'entity-session',
      reasons: expect.arrayContaining([expect.objectContaining({ sourceKind: 'file_snapshot' })]),
    })
    expect(service.searchSessions({ query: 'content:OXO-41' }).matches[0]).toMatchObject({
      sessionId: 'entity-session',
      reasons: expect.arrayContaining([
        expect.objectContaining({ sourceKind: 'compaction', sourceId: 'summary-1' }),
      ]),
    })
    expect(service.searchSessions({ query: 'content:todo' }).matches[0]).toMatchObject({
      sessionId: 'entity-session',
      reasons: expect.arrayContaining([
        expect.objectContaining({ sourceKind: 'todo', sourceId: 'todo-record' }),
      ]),
    })
    expect(service.searchSessions({ query: 'content:claude-opus-4-6' }).matches[0]).toMatchObject({
      sessionId: 'entity-session',
      reasons: expect.arrayContaining([expect.objectContaining({ sourceKind: 'settings' })]),
    })
    service.dispose()

    const restartedService = createSessionSearchService({
      bootstrap,
      loadSessionTranscript: vi.fn(),
      backgroundHydrationDelayMs: 0,
      hydrationYieldMs: 0,
      searchDatabasePath,
    })
    expect(
      restartedService.searchSessions({ query: 'content:pnpm test' }).matches[0],
    ).toMatchObject({
      sessionId: 'entity-session',
      reasons: expect.arrayContaining([
        expect.objectContaining({ sourceKind: 'tool_call', sourceId: 'tool-execute' }),
      ]),
    })
    restartedService.dispose()
  })

  it('ranks exact titles above newer broad title matches', () => {
    const service = createSessionSearchService({
      bootstrap: createBootstrap([
        createSession({
          id: 'older-exact-title',
          title: 'SDK runtime',
          lastActivityAt: '2026-03-24T19:00:00.000Z',
        }),
        createSession({
          id: 'newer-title-prefix',
          title: 'SDK runtime migration',
          lastActivityAt: '2026-03-24T22:00:00.000Z',
        }),
      ]),
      loadSessionTranscript: vi.fn(),
    })

    expect(service.searchSessions({ query: 'title:"SDK runtime"' }).matches[0]?.sessionId).toBe(
      'older-exact-title',
    )
  })

  it('blends exact entity facets with metadata filters using AND semantics', async () => {
    const service = createSessionSearchService({
      bootstrap: createBootstrap([
        createSession({
          id: 'exact-entity-session',
          projectDisplayName: 'Awesome',
          title: 'Implement durable search',
        }),
        createSession({
          id: 'prose-session',
          projectDisplayName: 'Awesome',
          title: 'contracts.ts OXO-41 ResizeObserver pnpm test notes',
        }),
        createSession({
          id: 'wrong-project-session',
          projectDisplayName: 'Other',
          title: 'Execute failure',
        }),
      ]),
      loadSessionTranscript: vi.fn(async (sessionId: string) => {
        if (sessionId === 'exact-entity-session') {
          return createTranscript(
            sessionId,
            [
              {
                kind: 'tool_call',
                id: 'tool-execute',
                toolUseId: 'tool-execute',
                occurredAt: '2026-06-11T10:00:00.000Z',
                toolName: 'Execute',
                status: 'failed',
                inputMarkdown: 'pnpm test --filter daemon/transport.ts',
                resultMarkdown: 'FAIL daemon/transport.ts ResizeObserver is not defined',
                resultIsError: true,
              },
            ],
            [
              {
                ...createSourceRecord({
                  lineNo: 1,
                  byteOffset: 0,
                  byteLength: 120,
                  recordId: 'summary-record',
                  recordType: 'compaction_state',
                }),
                compactionSummaryId: 'summary-oxo-41',
                payload: {
                  summary: { id: 'summary-oxo-41', text: 'OXO-41 search memory' },
                },
                type: 'compaction_state',
              },
            ],
            {
              settings: { modelId: 'claude-opus-4-6', reasoningEffort: 'high' },
              snapshots: [
                {
                  filePath: '/repo/src/shared/ipc/contracts.ts',
                  messageId: 'message-1',
                  toolCallId: 'tool-execute',
                },
              ],
            },
          )
        }

        return createTranscript(sessionId, [
          {
            kind: 'message',
            id: `message-${sessionId}`,
            occurredAt: null,
            role: 'assistant',
            markdown:
              sessionId === 'wrong-project-session'
                ? 'pnpm test contracts.ts OXO-41 ResizeObserver'
                : 'Broad prose says contracts.ts OXO-41 ResizeObserver pnpm test but has no exact entities.',
          },
        ])
      }),
      backgroundHydrationDelayMs: 0,
      hydrationYieldMs: 0,
    })

    await service.waitForHydration()

    expect(service.searchSessions({ query: 'file:contracts.ts' }).matches[0]).toMatchObject({
      sessionId: 'exact-entity-session',
      reasons: expect.arrayContaining([expect.objectContaining({ sourceKind: 'file_snapshot' })]),
    })
    expect(
      service.searchSessions({ query: 'command:"pnpm test --filter daemon/transport.ts"' })
        .matches[0],
    ).toMatchObject({
      sessionId: 'exact-entity-session',
      reasons: expect.arrayContaining([
        expect.objectContaining({ sourceKind: 'tool_call', sourceId: 'tool-execute' }),
      ]),
    })
    expect(service.searchSessions({ query: 'issue:OXO-41' }).matches[0]).toMatchObject({
      sessionId: 'exact-entity-session',
      reasons: expect.arrayContaining([
        expect.objectContaining({ sourceKind: 'compaction', sourceId: 'summary-oxo-41' }),
      ]),
    })
    expect(service.searchSessions({ query: 'error:ResizeObserver' }).matches[0]).toMatchObject({
      sessionId: 'exact-entity-session',
      reasons: expect.arrayContaining([
        expect.objectContaining({ sourceKind: 'tool_call', sourceId: 'tool-execute' }),
      ]),
    })
    expect(
      service.searchSessions({
        query: 'why did daemon/transport.ts fail with ResizeObserver',
      }).matches[0],
    ).toMatchObject({
      sessionId: 'exact-entity-session',
      reasons: expect.arrayContaining([
        expect.objectContaining({ sourceKind: 'tool_call', sourceId: 'tool-execute' }),
      ]),
    })
    expect(
      service
        .searchSessions({
          query:
            'file:contracts.ts issue:OXO-41 error:ResizeObserver model:opus reasoning:high project:awesome',
        })
        .matches.map((match) => match.sessionId),
    ).toEqual(['exact-entity-session'])
  })

  it('uses fragment rows to find content beyond the capped whole-session document', async () => {
    const largeMessage = `${'alpha '.repeat(40)}deep unique fragment needle`
    const service = createSessionSearchService({
      bootstrap: createBootstrap([createSession({ id: 'fragment-session' })]),
      loadSessionTranscript: vi.fn(async (sessionId: string) =>
        createTranscript(sessionId, [
          {
            kind: 'message',
            id: `message-${sessionId}`,
            sourceMessageId: `message-${sessionId}`,
            occurredAt: '2026-06-11T10:00:00.000Z',
            role: 'assistant',
            markdown: largeMessage,
          },
        ]),
      ),
      backgroundHydrationDelayMs: 0,
      hydrationYieldMs: 0,
      maxIndexedContentChars: 20,
    })

    await service.waitForHydration()

    const match = service.searchSessions({ query: 'content:needle' }).matches[0]
    expect(match).toMatchObject({
      sessionId: 'fragment-session',
      reasons: [
        expect.objectContaining({
          field: 'content',
          sourceKind: 'block',
          sourceId: 'message-fragment-session',
        }),
      ],
    })
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
