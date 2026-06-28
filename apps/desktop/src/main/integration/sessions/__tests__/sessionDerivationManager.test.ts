import { describe, expect, it, vi } from 'vitest'
import { createSessionDerivationManager } from '../sessionDerivationManager'
import type { ManagedSession, StreamJsonRpcProcessTransportLike } from '../types'

function createMockTransport(): StreamJsonRpcProcessTransportLike {
  return {
    processId: 5678,
    subscribe: vi.fn().mockReturnValue(vi.fn()),
    initializeSession: vi.fn(),
    loadSession: vi.fn().mockResolvedValue({ session: { messages: [] } }),
    interruptSession: vi.fn(),
    addUserMessage: vi.fn(),
    forkSession: vi.fn().mockResolvedValue({ newSessionId: 'derived-1' }),
    getRewindInfo: vi.fn(),
    executeRewind: vi.fn().mockResolvedValue({
      newSessionId: 'rewind-1',
      restoredCount: 1,
      deletedCount: 0,
      failedRestoreCount: 0,
      failedDeleteCount: 0,
    }),
    compactSession: vi.fn().mockResolvedValue({
      newSessionId: 'compact-1',
      removedCount: 3,
    }),
    updateSessionSettings: vi.fn(),
    resolvePermissionRequest: vi.fn(),
    resolveAskUserRequest: vi.fn(),
    dispose: vi.fn(),
  }
}

function createManagedSession(overrides: Partial<ManagedSession> = {}): ManagedSession {
  return {
    sessionId: 'parent-1',
    title: 'Parent',
    cwd: '/tmp/test',
    createdAt: '2026-04-09T00:00:00.000Z',
    updatedAt: '2026-04-09T00:00:00.000Z',
    parentSessionId: null,
    processId: 1234,
    transport: createMockTransport(),
    messages: [],
    events: [],
    availableModels: [],
    settings: { modelId: 'gpt-5.4' },
    transcriptRevision: 0,
    viewerIds: new Set(),
    subscribers: new Set(),
    reconnectPromise: null,
    workingStatus: 'active',
    lastEventAt: null,
    ...overrides,
  }
}

function createManagedSessionFromArgs(
  sessionId: string,
  transport: StreamJsonRpcProcessTransportLike,
  cwd: string | null,
  title: string,
  _messages = [] as ManagedSession['messages'],
  _events = [] as ManagedSession['events'],
  settings: ManagedSession['settings'] = { modelId: 'gpt-5.4' },
  availableModels: ManagedSession['availableModels'] = [],
  _viewerId?: string,
  parentSessionId = 'parent-1',
): ManagedSession {
  return {
    sessionId,
    title,
    cwd,
    createdAt: '2026-04-09T00:00:01.000Z',
    updatedAt: '2026-04-09T00:00:01.000Z',
    parentSessionId,
    processId: 5678,
    transport,
    messages: [],
    events: [],
    availableModels,
    settings,
    transcriptRevision: 0,
    viewerIds: new Set(),
    subscribers: new Set(),
    reconnectPromise: null,
    workingStatus: 'idle',
    lastEventAt: null,
  }
}

describe('SessionDerivationManager', () => {
  it('forks a session by calling transport and attaching the derived session', async () => {
    const parentSession = createManagedSession()
    const transport = parentSession.transport as StreamJsonRpcProcessTransportLike
    const manager = createSessionDerivationManager({
      now: () => '2026-04-09T00:00:01.000Z',
      nextRequestId: () => 'req:1',
      createTransport: vi.fn().mockReturnValue(createMockTransport()),
      hydrateManagedSession: vi.fn(),
      bindTransport: vi.fn(),
      persistManagedSession: vi.fn(),
      createManagedSession: (sessionId, transport, cwd, title) =>
        createManagedSessionFromArgs(sessionId, transport, cwd, title),
    })

    const snapshot = await manager.fork(parentSession, { viewerId: 'w-1' })

    expect(transport.forkSession).toHaveBeenCalledWith('req:1')
    expect(snapshot.parentSessionId).toBe('parent-1')
  })

  it('executes rewind and returns the result with snapshot', async () => {
    const parentSession = createManagedSession()
    const transport = parentSession.transport as StreamJsonRpcProcessTransportLike
    const manager = createSessionDerivationManager({
      now: () => '2026-04-09T00:00:01.000Z',
      nextRequestId: () => 'req:1',
      createTransport: vi.fn().mockReturnValue(createMockTransport()),
      hydrateManagedSession: vi.fn(),
      bindTransport: vi.fn(),
      persistManagedSession: vi.fn(),
      createManagedSession: (sessionId, transport, cwd, title) =>
        createManagedSessionFromArgs(sessionId, transport, cwd, title),
    })

    const result = await manager.executeRewind(parentSession, {
      messageId: 'msg-1',
      filesToRestore: [],
      filesToDelete: [],
      forkTitle: 'Rewound',
      viewerId: 'w-1',
    })

    expect(transport.executeRewind).toHaveBeenCalledWith('req:1', expect.anything())
    expect(result).toMatchObject({
      restoredCount: 1,
      deletedCount: 0,
    })
    expect(result.snapshot.parentSessionId).toBe('parent-1')
  })

  it('compacts a session and returns the result with snapshot', async () => {
    const parentSession = createManagedSession()
    const transport = parentSession.transport as StreamJsonRpcProcessTransportLike
    const manager = createSessionDerivationManager({
      now: () => '2026-04-09T00:00:01.000Z',
      nextRequestId: () => 'req:1',
      createTransport: vi.fn().mockReturnValue(createMockTransport()),
      hydrateManagedSession: vi.fn(),
      bindTransport: vi.fn(),
      persistManagedSession: vi.fn(),
      createManagedSession: (sessionId, transport, cwd, title) =>
        createManagedSessionFromArgs(sessionId, transport, cwd, title),
    })

    const result = await manager.compact(parentSession, {
      customInstructions: 'Focus on core logic',
      viewerId: 'w-1',
    })

    expect(transport.compactSession).toHaveBeenCalledWith('req:1', 'Focus on core logic')
    expect(result).toMatchObject({
      removedCount: 3,
    })
    expect(result.snapshot.parentSessionId).toBe('parent-1')
  })

  it('normalizes derived session models before creating the fork snapshot', async () => {
    const parentSession = createManagedSession()
    const transport = parentSession.transport as StreamJsonRpcProcessTransportLike
    const derivedTransport = createMockTransport()
    vi.mocked(derivedTransport.loadSession).mockResolvedValue({
      session: { messages: [] },
      settings: { modelId: 'gpt-5.4' },
      availableModels: [
        {
          id: 'gpt-5.4',
          displayName: 'GPT 5.4',
          modelProvider: 'openai',
        } as never,
      ],
    })

    const manager = createSessionDerivationManager({
      now: () => '2026-04-09T00:00:01.000Z',
      nextRequestId: () => 'req:1',
      createTransport: vi.fn().mockReturnValue(derivedTransport),
      hydrateManagedSession: vi.fn(),
      bindTransport: vi.fn(),
      persistManagedSession: vi.fn(),
      createManagedSession: (
        sessionId,
        nextTransport,
        cwd,
        title,
        messages,
        events,
        settings,
        availableModels,
        viewerId,
        parentSessionId,
      ) =>
        createManagedSessionFromArgs(
          sessionId,
          nextTransport,
          cwd,
          title,
          messages,
          events,
          settings,
          availableModels,
          viewerId,
          parentSessionId,
        ),
    })

    const snapshot = await manager.fork(parentSession, { viewerId: 'w-1' })

    expect(transport.forkSession).toHaveBeenCalledWith('req:1')
    expect(snapshot.availableModels).toEqual([
      {
        id: 'gpt-5.4',
        name: 'GPT 5.4',
        provider: 'openai',
      },
    ])
  })
})
