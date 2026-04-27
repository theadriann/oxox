import { describe, expect, it, vi } from 'vitest'

import type {
  FoundationBootstrap,
  LiveSessionSnapshot,
  SessionRecord,
  SessionTranscript,
} from '../../../shared/ipc/contracts'
import { createSessionSearchService } from '../search/sessionSearchService'

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

describe('createSessionSearchService', () => {
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
