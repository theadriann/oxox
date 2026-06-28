import { describe, expect, it, vi } from 'vitest'

import { createFoundationSessionTransportFactory } from '../foundationService'
import type { StreamJsonRpcProcessTransportLike } from '../sessions/types'

function createTransport(label: string): StreamJsonRpcProcessTransportLike {
  return {
    processId: label === 'daemon' ? 0 : 1234,
    subscribe: () => () => undefined,
    initializeSession: vi.fn(),
    loadSession: vi.fn(),
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

describe('createFoundationSessionTransportFactory', () => {
  it('routes daemon catalog sessions to the SDK daemon live transport and keeps new sessions on process transport', () => {
    const daemonTransport = {
      listSessions: vi.fn(() => [
        {
          id: 'daemon-session-1',
          transport: 'daemon',
        },
      ]),
    }
    const daemonSessionTransport = createTransport('daemon')
    const processSessionTransport = createTransport('process')
    const createDaemonSessionTransport = vi.fn(() => daemonSessionTransport)
    const createProcessSessionTransport = vi.fn(() => processSessionTransport)
    const createMcpServers = vi.fn(() => [])
    const factory = createFoundationSessionTransportFactory({
      authProvider: { getApiKey: () => 'factory-key' },
      daemonTransport,
      createDaemonSessionTransport,
      createProcessSessionTransport,
      createMcpServers,
    })

    expect(factory({ sessionId: 'daemon-session-1', cwd: '/tmp/project' })).toBe(
      daemonSessionTransport,
    )
    expect(factory({ sessionId: 'local-session-1', cwd: '/tmp/project' })).toBe(
      processSessionTransport,
    )
    expect(factory({ sessionId: null, cwd: '/tmp/project' })).toBe(processSessionTransport)
    expect(createDaemonSessionTransport).toHaveBeenCalledWith({
      authProvider: { getApiKey: expect.any(Function) },
      cwd: '/tmp/project',
      sessionId: 'daemon-session-1',
    })
    expect(createProcessSessionTransport).toHaveBeenCalledWith({
      cwd: '/tmp/project',
      createMcpServers,
      sessionId: 'local-session-1',
    })
  })
})
