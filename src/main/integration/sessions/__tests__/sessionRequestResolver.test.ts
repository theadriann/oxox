import { describe, expect, it, vi } from 'vitest'

import { createSessionRequestResolver } from '../sessionRequestResolver'
import type { ManagedSession, StreamJsonRpcProcessTransportLike } from '../types'

function createMockTransport(): StreamJsonRpcProcessTransportLike {
  return {
    processId: 5678,
    subscribe: vi.fn().mockReturnValue(vi.fn()),
    initializeSession: vi.fn(),
    loadSession: vi.fn(),
    interruptSession: vi.fn(),
    addUserMessage: vi.fn(),
    forkSession: vi.fn(),
    getRewindInfo: vi.fn(),
    executeRewind: vi.fn(),
    compactSession: vi.fn(),
    updateSessionSettings: vi.fn(),
    resolvePermissionRequest: vi.fn().mockResolvedValue(undefined),
    resolveAskUserRequest: vi.fn().mockResolvedValue(undefined),
    dispose: vi.fn(),
  }
}

function createManagedSession(): ManagedSession {
  return {
    sessionId: 'session-1',
    title: 'Test session',
    cwd: '/tmp/test',
    createdAt: '2026-04-10T00:00:00.000Z',
    updatedAt: '2026-04-10T00:00:00.000Z',
    parentSessionId: null,
    processId: 5678,
    transport: createMockTransport(),
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
  }
}

describe('SessionRequestResolver', () => {
  it('resolves permission requests through the managed transport', async () => {
    const session = createManagedSession()
    const resolver = createSessionRequestResolver({
      getSession: vi.fn().mockReturnValue(session),
    })

    await resolver.resolvePermissionRequest('session-1', 'permission-1', 'approve')

    expect(session.transport?.resolvePermissionRequest).toHaveBeenCalledWith(
      'permission-1',
      'approve',
    )
  })

  it('resolves ask-user requests through the managed transport', async () => {
    const session = createManagedSession()
    const resolver = createSessionRequestResolver({
      getSession: vi.fn().mockReturnValue(session),
    })

    await resolver.resolveAskUserRequest('session-1', 'ask-1', [
      {
        index: 0,
        question: 'Continue?',
        answer: 'Yes',
      },
    ])

    expect(session.transport?.resolveAskUserRequest).toHaveBeenCalledWith('ask-1', [
      {
        index: 0,
        question: 'Continue?',
        answer: 'Yes',
      },
    ])
  })
})
