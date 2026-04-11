import { describe, expect, it, vi } from 'vitest'
import type { SessionEvent } from '../../protocol/sessionEvents'
import { createSessionStateTracker } from '../sessionStateTracker'
import type { ManagedSession } from '../types'

function createMockDatabase() {
  return {
    upsertSession: vi.fn(),
    upsertSessionRuntime: vi.fn(),
    clearSessionRuntime: vi.fn(),
    linkSessionParent: vi.fn(),
    getSession: vi.fn().mockReturnValue(null),
    listSessionRuntimes: vi.fn().mockReturnValue([]),
  }
}

function createManagedSession(overrides: Partial<ManagedSession> = {}): ManagedSession {
  return {
    sessionId: 'session-1',
    title: 'Test session',
    cwd: '/tmp/test',
    createdAt: '2026-04-09T00:00:00.000Z',
    updatedAt: '2026-04-09T00:00:00.000Z',
    parentSessionId: null,
    processId: 1234,
    transport: null,
    messages: [],
    events: [],
    availableModels: [],
    settings: {},
    transcriptRevision: 0,
    viewerIds: new Set(['window-a']),
    subscribers: new Set(),
    reconnectPromise: null,
    workingStatus: 'active',
    lastEventAt: null,
    ...overrides,
  }
}

describe('SessionStateTracker', () => {
  it('adds, retrieves, and removes sessions', () => {
    const db = createMockDatabase()
    const tracker = createSessionStateTracker({
      database: db as never,
      now: () => '2026-04-09T00:00:00.000Z',
    })
    const session = createManagedSession()

    tracker.set(session)
    expect(tracker.get('session-1')).toBe(session)
    expect(tracker.has('session-1')).toBe(true)
    expect(tracker.get('nonexistent')).toBeUndefined()

    tracker.delete('session-1')
    expect(tracker.get('session-1')).toBeUndefined()
  })

  it('persists session to database on persist call', () => {
    const db = createMockDatabase()
    const tracker = createSessionStateTracker({
      database: db as never,
      now: () => '2026-04-09T00:00:00.000Z',
    })
    const session = createManagedSession({
      messages: [{ id: 'm-1', role: 'user', content: 'hello' }],
    })

    tracker.persist(session)

    expect(db.upsertSession).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionId: 'session-1',
        status: 'active',
        hasUserMessage: true,
      }),
    )
    expect(db.upsertSessionRuntime).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionId: 'session-1',
        viewerCount: 1,
      }),
    )
  })

  it('generates unique request IDs with a prefix', () => {
    const db = createMockDatabase()
    const tracker = createSessionStateTracker({
      database: db as never,
      now: () => '2026-04-09T00:00:00.000Z',
    })

    expect(tracker.nextRequestId('session:create')).toBe('session:create:1')
    expect(tracker.nextRequestId('session:create')).toBe('session:create:2')
    expect(tracker.nextRequestId('session:message')).toBe('session:message:1')
  })

  it('emits events to subscribers and returns unsubscribe function', () => {
    const db = createMockDatabase()
    const tracker = createSessionStateTracker({
      database: db as never,
      now: () => '2026-04-09T00:00:00.000Z',
    })
    const listener = vi.fn()
    const session = createManagedSession({
      subscribers: new Set(),
    })
    tracker.set(session)

    const unsubscribe = tracker.subscribe('session-1', listener)
    const event = {
      type: 'message.delta',
      messageId: 'm-1',
      delta: 'hi',
      channel: 'assistant',
    } as never as SessionEvent
    tracker.emitToSubscribers(session, event)

    expect(listener).toHaveBeenCalledWith(event)

    unsubscribe()
    listener.mockClear()
    tracker.emitToSubscribers(session, event)
    expect(listener).not.toHaveBeenCalled()
  })

  it('converts a managed session to a snapshot', () => {
    const db = createMockDatabase()
    const tracker = createSessionStateTracker({
      database: db as never,
      now: () => '2026-04-09T00:00:00.000Z',
    })
    const session = createManagedSession()

    const snapshot = tracker.toSnapshot(session)

    expect(snapshot).toMatchObject({
      sessionId: 'session-1',
      title: 'Test session',
      status: 'active',
      viewerCount: 1,
      processId: 1234,
    })
  })

  it('lists all session snapshots', () => {
    const db = createMockDatabase()
    const tracker = createSessionStateTracker({
      database: db as never,
      now: () => '2026-04-09T00:00:00.000Z',
    })
    tracker.set(createManagedSession({ sessionId: 'a' }))
    tracker.set(createManagedSession({ sessionId: 'b' }))

    const snapshots = tracker.listSnapshots()
    expect(snapshots).toHaveLength(2)
    expect(snapshots.map((s) => s.sessionId).sort()).toEqual(['a', 'b'])
  })

  it('lists notification summaries with pending permissions and completion count', () => {
    const db = createMockDatabase()
    const tracker = createSessionStateTracker({
      database: db as never,
      now: () => '2026-04-09T00:00:00.000Z',
    })
    tracker.set(
      createManagedSession({
        sessionId: 'session-1',
        events: [
          { type: 'permission.requested', requestId: 'p-1', reason: 'exec' } as never,
          { type: 'stream.completed' } as never,
        ],
      }),
    )

    const summaries = tracker.listNotificationSummaries()
    expect(summaries).toEqual([
      expect.objectContaining({
        sessionId: 'session-1',
        pendingPermissions: [{ requestId: 'p-1', reason: 'exec' }],
        completionCount: 1,
      }),
    ])
  })

  it('iterates sessions for disposal', () => {
    const db = createMockDatabase()
    const tracker = createSessionStateTracker({
      database: db as never,
      now: () => '2026-04-09T00:00:00.000Z',
    })
    tracker.set(createManagedSession({ sessionId: 'a' }))
    tracker.set(createManagedSession({ sessionId: 'b' }))

    const visited: string[] = []
    tracker.forEach((session) => {
      visited.push(session.sessionId)
    })
    expect(visited.sort()).toEqual(['a', 'b'])
  })
})
