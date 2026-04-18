// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest'

import type {
  LiveSessionSnapshot,
  OxoxBridge,
  SessionRecord,
} from '../../../../shared/ipc/contracts'
import { LiveSessionStore } from '../LiveSessionStore'
import { SessionStore } from '../SessionStore'
import { createStoreEventBus } from '../storeEventBus'

function createSessionRecord(overrides: Partial<SessionRecord> = {}): SessionRecord {
  return {
    id: 'session-live-1',
    projectId: 'project-live',
    projectWorkspacePath: '/tmp/live-session',
    projectDisplayName: 'Factory Desktop',
    modelId: 'gpt-5.4',
    title: 'Original title',
    status: 'idle',
    transport: 'artifacts',
    createdAt: '2026-03-24T23:30:00.000Z',
    lastActivityAt: '2026-03-24T23:40:00.000Z',
    updatedAt: '2026-03-24T23:40:00.000Z',
    ...overrides,
  }
}

function createLiveSnapshot(overrides: Partial<LiveSessionSnapshot> = {}): LiveSessionSnapshot {
  return {
    sessionId: 'session-live-1',
    title: 'Live title',
    status: 'active',
    transport: 'stream-jsonrpc',
    processId: 4242,
    viewerCount: 1,
    projectWorkspacePath: '/tmp/live-session',
    parentSessionId: null,
    availableModels: [
      { id: 'gpt-5.4', name: 'GPT 5.4' },
      { id: 'gpt-5.4-mini', name: 'GPT 5.4 Mini' },
    ],
    settings: {
      modelId: 'gpt-5.4-mini',
      interactionMode: 'spec',
    },
    transcriptRevision: 0,
    messages: [],
    events: [],
    ...overrides,
  }
}

function createStoreHarness(
  sessionStore: SessionStore,
  snapshotLoader?: (sessionId: string) => Promise<LiveSessionSnapshot | null>,
): LiveSessionStore {
  const bus = createStoreEventBus()
  bus.subscribe('session-upsert', ({ record }) => {
    sessionStore.upsertSession(record)
  })

  return new LiveSessionStore(
    () => sessionStore.selectedSessionId || null,
    bus,
    snapshotLoader,
    (sessionId) => sessionStore.sessions.find((session) => session.id === sessionId),
  )
}

describe('LiveSessionStore', () => {
  beforeEach(() => {
    window.localStorage.clear()
    Reflect.deleteProperty(window, 'oxox')
  })

  it('upserts snapshots, derives selection state, and clears snapshots', () => {
    const sessionStore = new SessionStore()
    sessionStore.hydrateSessions([createSessionRecord()])
    sessionStore.selectSession('session-live-1')

    const store = createStoreHarness(sessionStore)
    const snapshot = createLiveSnapshot({ status: 'reconnecting', title: 'Recovered live title' })

    store.upsertSnapshot(snapshot)

    expect(store.snapshotsById.get('session-live-1')).toEqual(snapshot)
    expect(store.selectedSnapshot).toEqual(snapshot)
    expect(store.selectedSnapshotId).toBe('session-live-1')
    expect(store.selectedNeedsReconnect).toBe(true)
    expect(sessionStore.selectedSession?.title).toBe('Recovered live title')
    expect(sessionStore.selectedSession?.status).toBe('reconnecting')
    expect(sessionStore.selectedSession?.modelId).toBe('gpt-5.4-mini')

    store.clearSnapshot('session-live-1')

    expect(store.snapshotsById.has('session-live-1')).toBe(false)
    expect(store.selectedSnapshot).toBeNull()
    expect(store.selectedSnapshotId).toBeNull()
    expect(store.selectedNeedsReconnect).toBe(false)
  })

  it('refreshes a snapshot through an injected loader and syncs it into the session store', async () => {
    const sessionStore = new SessionStore()
    sessionStore.hydrateSessions([createSessionRecord()])
    sessionStore.selectSession('session-live-1')

    const snapshot = createLiveSnapshot({
      title: 'Fresh IPC snapshot',
      status: 'error',
    })
    const loadSnapshot = vi.fn().mockResolvedValue(snapshot)

    const store = createStoreHarness(sessionStore, loadSnapshot)

    await store.refreshSnapshot('session-live-1')

    expect(loadSnapshot).toHaveBeenCalledWith('session-live-1')
    expect(store.selectedSnapshot).toEqual(snapshot)
    expect(store.selectedNeedsReconnect).toBe(true)
    expect(sessionStore.selectedSession?.title).toBe('Fresh IPC snapshot')
    expect(sessionStore.selectedSession?.status).toBe('error')
  })

  it('returns null snapshots when no injected loader is provided', async () => {
    const sessionStore = new SessionStore()
    sessionStore.hydrateSessions([createSessionRecord()])
    sessionStore.selectSession('session-live-1')

    const store = createStoreHarness(sessionStore)

    await store.refreshSnapshot('session-live-1')

    expect(store.selectedSnapshot).toBeNull()
    expect(store.selectedNeedsReconnect).toBe(false)
  })

  it('does not read from the ambient bridge when no snapshot loader is provided', async () => {
    const sessionStore = new SessionStore()
    sessionStore.hydrateSessions([createSessionRecord()])
    sessionStore.selectSession('session-live-1')

    const getSnapshot = vi.fn().mockResolvedValue(createLiveSnapshot())
    window.oxox = {
      session: {
        getSnapshot,
      },
    } as OxoxBridge

    const store = createStoreHarness(sessionStore)

    await store.refreshSnapshot('session-live-1')

    expect(getSnapshot).not.toHaveBeenCalled()
    expect(store.selectedSnapshot).toBeNull()
  })

  it('skips refreshing and syncing when the snapshot has not meaningfully changed', async () => {
    const sessionStore = new SessionStore()
    sessionStore.hydrateSessions([createSessionRecord()])
    sessionStore.selectSession('session-live-1')

    const originalSnapshot = createLiveSnapshot({
      events: [{ type: 'message.completed' }],
      messages: [{ id: 'msg-1', content: 'Hello', role: 'assistant' }],
      viewerCount: 2,
    })

    const loadSnapshot = vi.fn().mockResolvedValue({
      ...originalSnapshot,
      availableModels: [...originalSnapshot.availableModels],
      events: [...originalSnapshot.events],
      messages: [...originalSnapshot.messages],
      settings: { ...originalSnapshot.settings },
    })
    const store = createStoreHarness(sessionStore, loadSnapshot)
    store.upsertSnapshot(originalSnapshot)

    const initialSnapshotReference = store.snapshotsById.get('session-live-1')
    const initialSessionsReference = sessionStore.sessions

    await store.refreshSnapshot('session-live-1')

    expect(store.snapshotsById.get('session-live-1')).toBe(initialSnapshotReference)
    expect(sessionStore.sessions).toBe(initialSessionsReference)
  })

  it('does not upsert the session list when an incoming snapshot is unchanged', () => {
    const sessionStore = new SessionStore()
    sessionStore.hydrateSessions([createSessionRecord()])

    const store = createStoreHarness(sessionStore)
    const snapshot = createLiveSnapshot({
      events: [{ type: 'message.completed' }],
      messages: [{ id: 'msg-1', content: 'Hello', role: 'assistant' }],
      viewerCount: 2,
    })

    store.upsertSnapshot(snapshot)

    const initialSnapshotReference = store.snapshotsById.get('session-live-1')
    const initialSessionsReference = sessionStore.sessions

    store.upsertSnapshot({
      ...snapshot,
      availableModels: [...snapshot.availableModels],
      events: [...snapshot.events],
      messages: [...snapshot.messages],
      settings: { ...snapshot.settings },
    })

    expect(store.snapshotsById.get('session-live-1')).toBe(initialSnapshotReference)
    expect(sessionStore.sessions).toBe(initialSessionsReference)
  })

  it('refreshes when the latest message changes without changing the message count', async () => {
    const sessionStore = new SessionStore()
    sessionStore.hydrateSessions([createSessionRecord()])
    sessionStore.selectSession('session-live-1')

    const loadSnapshot = vi.fn().mockResolvedValue(
      createLiveSnapshot({
        messages: [{ id: 'msg-1', content: 'Updated hello', role: 'assistant' }],
      }),
    )
    const store = createStoreHarness(sessionStore, loadSnapshot)
    store.upsertSnapshot(
      createLiveSnapshot({
        messages: [{ id: 'msg-1', content: 'Hello', role: 'assistant' }],
      }),
    )

    await store.refreshSnapshot('session-live-1')

    expect(store.selectedSnapshot?.messages[0]?.content).toBe('Updated hello')
  })

  it('refreshes when session tool override settings change', async () => {
    const sessionStore = new SessionStore()
    sessionStore.hydrateSessions([createSessionRecord()])
    sessionStore.selectSession('session-live-1')

    const loadSnapshot = vi.fn().mockResolvedValue(
      createLiveSnapshot({
        settings: {
          modelId: 'gpt-5.4',
          interactionMode: 'auto',
          enabledToolIds: ['Read'],
          disabledToolIds: ['Execute'],
        },
      }),
    )
    const store = createStoreHarness(sessionStore, loadSnapshot)
    store.upsertSnapshot(
      createLiveSnapshot({
        settings: {
          modelId: 'gpt-5.4',
          interactionMode: 'auto',
        },
      }),
    )

    await store.refreshSnapshot('session-live-1')

    expect(store.selectedSnapshot?.settings.enabledToolIds).toEqual(['Read'])
    expect(store.selectedSnapshot?.settings.disabledToolIds).toEqual(['Execute'])
  })

  it('preserves existing activity timestamps when syncing live snapshot metadata', () => {
    const sessionStore = new SessionStore()
    sessionStore.hydrateSessions([
      createSessionRecord({
        lastActivityAt: '2026-04-06T23:00:00.000Z',
        updatedAt: '2026-04-06T23:00:00.000Z',
      }),
    ])

    const store = createStoreHarness(sessionStore)

    store.upsertSnapshot(
      createLiveSnapshot({
        status: 'waiting',
        title: 'Live title changed',
      }),
    )

    expect(sessionStore.sessions[0]?.lastActivityAt).toBe('2026-04-06T23:00:00.000Z')
    expect(sessionStore.sessions[0]?.updatedAt).toBe('2026-04-06T23:00:00.000Z')
  })

  it('preserves existing project display names when syncing live snapshots', () => {
    const sessionStore = new SessionStore()
    sessionStore.hydrateSessions([
      createSessionRecord({
        projectDisplayName: 'Factory Desktop',
        projectWorkspacePath: '/tmp/live-session',
      }),
    ])

    const store = createStoreHarness(sessionStore)

    store.upsertSnapshot(createLiveSnapshot())

    expect(sessionStore.selectedSession?.projectLabel).toBe('Factory Desktop')
  })

  it('builds live timeline items for synced snapshots', () => {
    const sessionStore = new SessionStore()
    sessionStore.hydrateSessions([createSessionRecord()])

    const store = createStoreHarness(sessionStore)

    store.upsertSnapshot(
      createLiveSnapshot({
        events: [
          {
            type: 'message.completed',
            messageId: 'assistant-1',
            content: 'Streaming finished.',
            role: 'assistant',
          },
          {
            type: 'stream.warning',
            warning: 'Connection is unstable.',
          },
        ],
      }),
    )

    expect(store.timelineItemsForSession('session-live-1')).toMatchObject([
      {
        kind: 'message',
        id: 'message:assistant-1:0',
        content: 'Streaming finished.',
      },
      {
        kind: 'event',
        title: 'Stream warning',
      },
    ])
  })

  it('incrementally appends live timeline items without replacing unchanged entries', () => {
    const sessionStore = new SessionStore()
    sessionStore.hydrateSessions([createSessionRecord()])

    const store = createStoreHarness(sessionStore)
    const initialSnapshot = createLiveSnapshot({
      events: [
        {
          type: 'message.completed',
          messageId: 'assistant-1',
          content: 'Initial response.',
          role: 'assistant',
        },
      ],
    })

    store.upsertSnapshot(initialSnapshot)

    const initialItems = store.timelineItemsForSession('session-live-1')
    const initialMessageItem = initialItems[0]

    store.upsertSnapshot({
      ...initialSnapshot,
      events: [
        ...initialSnapshot.events,
        {
          type: 'stream.warning',
          warning: 'Latency increased.',
        },
      ],
    })

    const nextItems = store.timelineItemsForSession('session-live-1')

    expect(nextItems).toHaveLength(2)
    expect(nextItems[0]).toBe(initialMessageItem)
    expect(nextItems[1]).toMatchObject({
      kind: 'event',
      title: 'Stream warning',
    })
  })

  it('preserves the timeline array identity when only live metadata changes', () => {
    const sessionStore = new SessionStore()
    sessionStore.hydrateSessions([createSessionRecord()])
    sessionStore.selectSession('session-live-1')

    const store = createStoreHarness(sessionStore)
    const snapshot = createLiveSnapshot({
      events: [
        {
          type: 'message.completed',
          messageId: 'assistant-1',
          content: 'Stable transcript body.',
          role: 'assistant',
        },
      ],
    })

    store.upsertSnapshot(snapshot)

    const initialTimeline = store.selectedTimelineItems

    store.upsertSnapshot({
      ...snapshot,
      viewerCount: 2,
      status: 'waiting',
      title: 'Live title (updated)',
    })

    expect(store.selectedTimelineItems).toBe(initialTimeline)
    expect(store.selectedSnapshot?.viewerCount).toBe(2)
    expect(store.selectedSnapshot?.status).toBe('waiting')
  })

  it('forces a timeline rebuild when transcript revision changes during hydration', () => {
    const sessionStore = new SessionStore()
    sessionStore.hydrateSessions([createSessionRecord()])

    const store = createStoreHarness(sessionStore)
    const initialSnapshot = createLiveSnapshot({
      transcriptRevision: 0,
      messages: [
        {
          id: 'assistant-1',
          role: 'assistant',
          content: 'Original assistant response.',
        },
        {
          id: 'assistant-2',
          role: 'assistant',
          content: 'Tail message stays the same.',
        },
      ],
    })

    store.upsertSnapshot(initialSnapshot)

    store.upsertSnapshot({
      ...initialSnapshot,
      transcriptRevision: 1,
      messages: [
        {
          id: 'assistant-1',
          role: 'assistant',
          content: 'Hydrated assistant response.',
        },
        {
          id: 'assistant-2',
          role: 'assistant',
          content: 'Tail message stays the same.',
        },
      ],
      events: [
        {
          type: 'stream.warning',
          warning: 'Connection restored.',
          kind: 'reconnected',
        },
      ],
    })

    expect(store.timelineItemsForSession('session-live-1')).toMatchObject([
      {
        kind: 'message',
        content: 'Hydrated assistant response.',
      },
      {
        kind: 'message',
        content: 'Tail message stays the same.',
      },
      {
        kind: 'event',
        title: 'Stream warning',
      },
    ])
  })

  it('emits session-upsert after accepting a changed snapshot', () => {
    const bus = createStoreEventBus()
    const emitted: Array<{ record: SessionRecord }> = []
    bus.subscribe('session-upsert', (payload) => {
      emitted.push(payload)
    })

    const store = new LiveSessionStore(
      () => 'session-live-1',
      bus,
      async () => null,
      () => undefined,
    )

    store.upsertSnapshot(createLiveSnapshot({ title: 'Recovered live title' }))

    expect(emitted).toEqual([
      {
        record: expect.objectContaining({
          id: 'session-live-1',
          title: 'Recovered live title',
          status: 'active',
        }),
      },
    ])
  })
})
