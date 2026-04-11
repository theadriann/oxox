import { describe, expect, it, vi } from 'vitest'
import { createSessionReconnectHandler } from '../sessionReconnectHandler'
import type { ManagedSession, StreamJsonRpcProcessTransportLike } from '../types'

function createMockTransport(
  loadResult: unknown = { session: { messages: [] } },
): StreamJsonRpcProcessTransportLike {
  return {
    processId: 5678,
    subscribe: vi.fn().mockReturnValue(vi.fn()),
    initializeSession: vi.fn(),
    loadSession: vi.fn().mockResolvedValue(loadResult),
    interruptSession: vi.fn(),
    addUserMessage: vi.fn(),
    forkSession: vi.fn(),
    getRewindInfo: vi.fn(),
    executeRewind: vi.fn(),
    compactSession: vi.fn(),
    updateSessionSettings: vi.fn(),
    resolvePermissionRequest: vi.fn(),
    resolveAskUserRequest: vi.fn(),
    dispose: vi.fn(),
  }
}

function createManagedSession(overrides: Partial<ManagedSession> = {}): ManagedSession {
  return {
    sessionId: 'session-1',
    title: 'Test',
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
    viewerIds: new Set(),
    subscribers: new Set(),
    reconnectPromise: null,
    workingStatus: 'active',
    lastEventAt: null,
    ...overrides,
  }
}

describe('SessionReconnectHandler', () => {
  it('reconnects a session with a new transport and emits a reconnected warning', async () => {
    const transport = createMockTransport({
      session: { messages: [{ id: 'm-1', role: 'user', content: 'hello' }] },
      settings: { modelId: 'gpt-5.4' },
      cwd: '/tmp/test',
      isAgentLoopInProgress: false,
    })
    const events: unknown[] = []
    const session = createManagedSession({
      viewerIds: new Set(['window-a']),
      subscribers: new Set([(event) => events.push(event)]),
    })
    const persist = vi.fn()
    const hydrate = vi.fn()
    const bindTransport = vi.fn()
    const createTransport = vi.fn().mockReturnValue(transport)

    const handler = createSessionReconnectHandler({
      reconnectDelayMs: 0,
      now: () => '2026-04-09T00:00:01.000Z',
      createTransport,
      hydrateManagedSession: hydrate,
      bindTransport,
      persistManagedSession: persist,
      nextRequestId: () => 'session:reattach:1',
    })

    await handler.reconnect(session)

    expect(createTransport).toHaveBeenCalledWith('session-1', '/tmp/test')
    expect(transport.loadSession).toHaveBeenCalledWith('session:reattach:1', 'session-1')
    expect(hydrate).toHaveBeenCalledWith(session, expect.anything())
    expect(bindTransport).toHaveBeenCalledWith(session, transport)
    expect(persist).toHaveBeenCalledWith(session)
    expect(session.events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: 'stream.warning',
          kind: 'reconnected',
        }),
      ]),
    )
  })

  it('deduplicates concurrent reconnect calls', async () => {
    let resolveLoad!: () => void
    const loadPromise = new Promise<void>((resolve) => {
      resolveLoad = resolve
    })
    const transport = createMockTransport()
    transport.loadSession = vi.fn().mockImplementation(async () => {
      await loadPromise
      return { session: { messages: [] } }
    })

    const session = createManagedSession()
    const handler = createSessionReconnectHandler({
      reconnectDelayMs: 0,
      now: () => '2026-04-09T00:00:01.000Z',
      createTransport: () => transport,
      hydrateManagedSession: vi.fn(),
      bindTransport: vi.fn(),
      persistManagedSession: vi.fn(),
      nextRequestId: () => 'session:reattach:1',
    })

    const first = handler.reconnect(session)
    const second = handler.reconnect(session)

    resolveLoad()

    await Promise.all([first, second])
    expect(transport.loadSession).toHaveBeenCalledTimes(1)
  })

  it('marks session as error when transport fails to load', async () => {
    const transport = createMockTransport()
    transport.loadSession = vi.fn().mockRejectedValue(new Error('load failed'))

    const session = createManagedSession()
    const persist = vi.fn()
    const handler = createSessionReconnectHandler({
      reconnectDelayMs: 0,
      now: () => '2026-04-09T00:00:01.000Z',
      createTransport: () => transport,
      hydrateManagedSession: vi.fn(),
      bindTransport: vi.fn(),
      persistManagedSession: persist,
      nextRequestId: () => 'session:reattach:1',
    })

    await handler.reconnect(session)

    expect(session.transport).toBeNull()
    expect(session.processId).toBeNull()
    expect(session.workingStatus).toBe('error')
    expect(persist).toHaveBeenCalledWith(session)
  })
})
