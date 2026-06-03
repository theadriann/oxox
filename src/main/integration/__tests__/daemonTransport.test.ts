import { EventEmitter } from 'node:events'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { createDaemonTransport } from '../daemon/transport'

class MockWebSocket extends EventEmitter {
  static readonly CONNECTING = 0
  static readonly OPEN = 1
  static readonly CLOSING = 2
  static readonly CLOSED = 3

  readonly url: string
  readonly sentPayloads: string[] = []
  readyState = MockWebSocket.CONNECTING

  constructor(url: string) {
    super()
    this.url = url
  }

  send(payload: string): void {
    this.sentPayloads.push(payload)
  }

  close(code = 1000, reason = 'client close'): void {
    this.readyState = MockWebSocket.CLOSED
    this.emit('close', code, Buffer.from(reason))
  }

  open(): void {
    this.readyState = MockWebSocket.OPEN
    this.emit('open')
  }

  fail(message = 'connect failure'): void {
    this.readyState = MockWebSocket.CLOSED
    this.emit('error', new Error(message))
  }

  serverClose(code = 1006, reason = 'server disconnect'): void {
    this.readyState = MockWebSocket.CLOSED
    this.emit('close', code, Buffer.from(reason))
  }

  respond(id: string, result: unknown): void {
    this.emit(
      'message',
      Buffer.from(
        JSON.stringify({
          jsonrpc: '2.0',
          factoryApiVersion: '1.0.0',
          type: 'response',
          id,
          result,
        }),
      ),
    )
  }
}

class MockSdkWebSocketTransport {
  readonly sentMessages: Record<string, unknown>[] = []
  readonly connect = vi.fn(async () => undefined)
  readonly close = vi.fn(async () => undefined)
  private messageHandler: ((message: Record<string, unknown>) => void) | null = null
  private errorHandler: ((error: Error) => void) | null = null
  isConnected = false

  send(message: Record<string, unknown>): void {
    this.sentMessages.push(message)
  }

  onMessage(callback: (message: Record<string, unknown>) => void): void {
    this.messageHandler = callback
  }

  onError(callback: (error: Error) => void): void {
    this.errorHandler = callback
  }

  respond(id: string, result: unknown): void {
    this.messageHandler?.({
      jsonrpc: '2.0',
      factoryApiVersion: '1.0.0',
      type: 'response',
      id,
      result,
    })
  }

  fail(message: string): void {
    this.errorHandler?.(new Error(message))
  }
}

function getLastRequestId(socket: MockWebSocket): string {
  const payload = socket.sentPayloads.at(-1)

  if (!payload) {
    throw new Error('Expected a sent payload.')
  }

  return JSON.parse(payload).id as string
}

function getSentMethods(socket: MockWebSocket): string[] {
  return socket.sentPayloads.map((payload) => JSON.parse(payload).method)
}

function getRequestIdsByMethod(socket: MockWebSocket): Record<string, string[]> {
  return socket.sentPayloads.reduce<Record<string, string[]>>((accumulator, payload) => {
    const parsed = JSON.parse(payload) as { method?: string; id?: string }

    if (parsed.method && parsed.id) {
      accumulator[parsed.method] ??= []
      accumulator[parsed.method].push(parsed.id)
    }

    return accumulator
  }, {})
}

function getRequiredValue<T>(value: T | undefined, message: string): T {
  if (value === undefined) {
    throw new Error(message)
  }

  return value
}

async function flushMicrotasks(): Promise<void> {
  for (let index = 0; index < 10; index += 1) {
    await Promise.resolve()
  }
}

function getLastSdkRequestId(transport: MockSdkWebSocketTransport): string {
  const payload = transport.sentMessages.at(-1)

  if (!payload || typeof payload.id !== 'string') {
    throw new Error('Expected a sent SDK transport payload.')
  }

  return payload.id
}

describe('createDaemonTransport', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('probes candidate ports, authenticates, and discovers sessions with list-only daemon capabilities', async () => {
    const sockets: MockWebSocket[] = []
    const transport = createDaemonTransport({
      authProvider: {
        getApiKey: () => 'test-api-key',
      },
      createWebSocket: (url) => {
        const socket = new MockWebSocket(url)
        sockets.push(socket)
        return socket
      },
      resolveCandidatePorts: async () => [37643, 58051],
      reconnectBaseDelayMs: 1_000,
      refreshIntervalMs: 60_000,
    })

    transport.start()
    await flushMicrotasks()

    expect(sockets).toHaveLength(1)
    expect(sockets[0]?.url).toBe('ws://127.0.0.1:37643')

    sockets[0]?.fail('ECONNREFUSED')
    await flushMicrotasks()

    expect(sockets).toHaveLength(2)
    expect(sockets[1]?.url).toBe('ws://127.0.0.1:58051')

    sockets[1]?.open()
    await flushMicrotasks()

    const secondarySocket = getRequiredValue(sockets[1], 'Expected fallback daemon socket')

    expect(getSentMethods(secondarySocket)).toEqual(['daemon.authenticate'])
    secondarySocket.respond(getLastRequestId(secondarySocket), {
      userId: 'user-1',
      orgId: 'org-1',
    })
    await flushMicrotasks()

    expect(getSentMethods(secondarySocket)).toEqual([
      'daemon.authenticate',
      'daemon.list_opened_sessions',
    ])
    secondarySocket.respond(getLastRequestId(secondarySocket), {
      supportedMethods: ['daemon.list_opened_sessions', 'daemon.list_available_sessions'],
      supportedNotifications: [],
      sessions: [
        {
          sessionId: 'daemon-opened',
          cwd: '/tmp/daemon-workspace',
          updatedAt: '2026-03-24T22:00:00.000Z',
          workingState: 'working',
        },
      ],
    })
    await flushMicrotasks()

    expect(getSentMethods(secondarySocket)).toEqual([
      'daemon.authenticate',
      'daemon.list_opened_sessions',
      'daemon.list_available_sessions',
    ])
    secondarySocket.respond(getLastRequestId(secondarySocket), {
      sessions: [
        {
          sessionId: 'daemon-opened',
          cwd: '/tmp/daemon-workspace',
          title: 'Daemon wins',
          updatedAt: '2026-03-24T22:01:00.000Z',
        },
        {
          sessionId: 'daemon-available',
          cwd: '/tmp/daemon-two',
          title: 'Daemon available',
          updatedAt: '2026-03-24T21:59:00.000Z',
        },
      ],
      hasMore: false,
    })
    await flushMicrotasks()

    expect(transport.getStatus()).toMatchObject({
      status: 'connected',
      connectedPort: 58051,
    })
    expect(transport.listSessions()).toEqual([
      expect.objectContaining({
        id: 'daemon-opened',
        title: 'Daemon wins',
        projectWorkspacePath: '/tmp/daemon-workspace',
        status: 'active',
        transport: 'daemon',
      }),
      expect.objectContaining({
        id: 'daemon-available',
        title: 'Daemon available',
        projectWorkspacePath: '/tmp/daemon-two',
        status: 'idle',
        transport: 'daemon',
      }),
    ])

    await transport.stop()
  })

  it('uses SDK local daemon and WebSocket primitives for default daemon connections', async () => {
    const sdkTransport = new MockSdkWebSocketTransport()
    const ensureLocalDaemon = vi.fn().mockResolvedValue({ port: 45678 })
    const resolveWebSocketUrl = vi.fn().mockReturnValue('ws://127.0.0.1:45678')
    const createSdkWebSocketTransport = vi.fn(() => sdkTransport)
    const transport = createDaemonTransport({
      authProvider: {
        getApiKey: () => 'sdk-key',
      },
      ensureLocalDaemon,
      resolveWebSocketUrl,
      createSdkWebSocketTransport,
      reconnectBaseDelayMs: 1_000,
      refreshIntervalMs: 60_000,
    })

    transport.start()
    await flushMicrotasks()

    expect(ensureLocalDaemon).toHaveBeenCalledTimes(1)
    expect(resolveWebSocketUrl).toHaveBeenCalledWith({
      apiKey: 'sdk-key',
      daemonPort: 45678,
    })
    expect(createSdkWebSocketTransport).toHaveBeenCalledTimes(1)
    expect(sdkTransport.connect).toHaveBeenCalledWith('ws://127.0.0.1:45678')
    expect(sdkTransport.sentMessages.at(-1)).toMatchObject({
      method: 'daemon.authenticate',
      params: {
        apiKey: 'sdk-key',
        caller: 'oxox',
      },
    })

    sdkTransport.respond(getLastSdkRequestId(sdkTransport), {
      userId: 'user-1',
      orgId: 'org-1',
    })
    await flushMicrotasks()
    sdkTransport.respond(getLastSdkRequestId(sdkTransport), {
      sessions: [
        {
          sessionId: 'sdk-daemon-session',
          cwd: '/tmp/sdk-daemon',
          updatedAt: 1_779_999_100,
          workingState: 'idle',
        },
      ],
    })
    await flushMicrotasks()
    sdkTransport.respond(getLastSdkRequestId(sdkTransport), {
      sessions: [],
      hasMore: false,
    })
    await flushMicrotasks()

    expect(transport.getStatus()).toMatchObject({
      status: 'connected',
      connectedPort: 45678,
    })
    expect(transport.listSessions()).toEqual([
      expect.objectContaining({
        id: 'sdk-daemon-session',
        transport: 'daemon',
      }),
    ])

    await transport.stop()
    expect(sdkTransport.close).toHaveBeenCalledTimes(1)
  })

  it('tracks supported methods and exposes daemon fork and rename capabilities', async () => {
    const sockets: MockWebSocket[] = []
    const transport = createDaemonTransport({
      authProvider: {
        getApiKey: () => 'capability-key',
      },
      createWebSocket: (url) => {
        const socket = new MockWebSocket(url)
        sockets.push(socket)
        return socket
      },
      resolveCandidatePorts: async () => [37643],
      reconnectBaseDelayMs: 1_000,
      refreshIntervalMs: 60_000,
    })

    transport.start()
    await flushMicrotasks()

    sockets[0]?.open()
    await flushMicrotasks()
    const socket = getRequiredValue(sockets[0], 'Expected daemon socket')

    socket.respond(getLastRequestId(socket), { userId: 'user-1', orgId: 'org-1' })
    await flushMicrotasks()
    socket.respond(getLastRequestId(socket), {
      supportedMethods: [
        'daemon.list_opened_sessions',
        'daemon.list_available_sessions',
        'daemon.fork_session',
        'daemon.rename_session',
      ],
      supportedNotifications: [],
      sessions: [],
    })
    await flushMicrotasks()
    socket.respond(getLastRequestId(socket), {
      sessions: [],
      hasMore: false,
    })
    await flushMicrotasks()

    expect(transport.supportsMethod('daemon.fork_session')).toBe(true)
    expect(transport.supportsMethod('daemon.rename_session')).toBe(true)

    await transport.stop()
  })

  it('accepts SDK-shaped daemon session lists, pages available sessions, and derives method support', async () => {
    const sockets: MockWebSocket[] = []
    const transport = createDaemonTransport({
      authProvider: {
        getApiKey: () => 'sdk-shaped-key',
      },
      createWebSocket: (url) => {
        const socket = new MockWebSocket(url)
        sockets.push(socket)
        return socket
      },
      resolveCandidatePorts: async () => [37643],
      reconnectBaseDelayMs: 1_000,
      refreshIntervalMs: 60_000,
    })

    transport.start()
    await flushMicrotasks()

    sockets[0]?.open()
    await flushMicrotasks()
    const socket = getRequiredValue(sockets[0], 'Expected daemon socket')

    socket.respond(getLastRequestId(socket), { userId: 'user-1', orgId: 'org-1' })
    await flushMicrotasks()
    socket.respond(getLastRequestId(socket), {
      sessions: [
        {
          sessionId: 'opened-sdk',
          cwd: '/tmp/worktree',
          repoRoot: '/tmp/repo',
          updatedAt: 1_779_999_100,
          workingState: 'executing_tool',
          messagesCount: 7,
          callingSessionId: 'parent-session',
        },
      ],
    })
    await flushMicrotasks()

    expect(JSON.parse(socket.sentPayloads.at(-1) ?? '{}')).toMatchObject({
      method: 'daemon.list_available_sessions',
      params: {
        limit: 100,
        includeMissionMetadata: true,
      },
    })

    socket.respond(getLastRequestId(socket), {
      sessions: [
        {
          sessionId: 'available-page-one',
          cwd: '/tmp/available-one',
          updatedAt: 1_779_999_000,
          title: 'Available page one',
          messagesCount: 3,
        },
      ],
      hasMore: true,
      nextCursor: 1_779_998_900,
    })
    await flushMicrotasks()

    expect(JSON.parse(socket.sentPayloads.at(-1) ?? '{}')).toMatchObject({
      method: 'daemon.list_available_sessions',
      params: {
        endBefore: 1_779_998_900,
      },
    })

    socket.respond(getLastRequestId(socket), {
      sessions: [
        {
          sessionId: 'available-page-two',
          cwd: '/tmp/available-two',
          updatedAt: 1_779_998_800,
          title: 'Available page two',
        },
      ],
      hasMore: false,
    })
    await flushMicrotasks()

    expect(transport.getStatus().status).toBe('connected')
    expect(transport.supportsMethod('daemon.rename_session')).toBe(true)
    expect(transport.supportsMethod('daemon.compact_session')).toBe(true)
    expect(transport.listSessions()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'opened-sdk',
          parentSessionId: 'parent-session',
          projectWorkspacePath: '/tmp/repo',
          messageCount: 7,
          status: 'active',
        }),
        expect.objectContaining({
          id: 'available-page-one',
          messageCount: 3,
          title: 'Available page one',
        }),
        expect.objectContaining({
          id: 'available-page-two',
          title: 'Available page two',
        }),
      ]),
    )

    await transport.stop()
  })

  it('sends daemon.fork_session with the selected session id', async () => {
    const sockets: MockWebSocket[] = []
    const transport = createDaemonTransport({
      authProvider: {
        getApiKey: () => 'fork-key',
      },
      createWebSocket: (url) => {
        const socket = new MockWebSocket(url)
        sockets.push(socket)
        return socket
      },
      resolveCandidatePorts: async () => [37643],
      reconnectBaseDelayMs: 1_000,
      refreshIntervalMs: 60_000,
    })

    transport.start()
    await flushMicrotasks()

    sockets[0]?.open()
    await flushMicrotasks()
    const socket = getRequiredValue(sockets[0], 'Expected daemon socket')

    socket.respond(getLastRequestId(socket), { userId: 'user-1', orgId: 'org-1' })
    await flushMicrotasks()
    socket.respond(getLastRequestId(socket), {
      supportedMethods: [
        'daemon.list_opened_sessions',
        'daemon.list_available_sessions',
        'daemon.fork_session',
      ],
      supportedNotifications: [],
      sessions: [],
    })
    await flushMicrotasks()
    socket.respond(getLastRequestId(socket), {
      sessions: [],
      hasMore: false,
    })
    await flushMicrotasks()

    const result = transport.forkSession('session-alpha')

    expect(getSentMethods(socket).at(-1)).toBe('daemon.fork_session')
    expect(JSON.parse(socket.sentPayloads.at(-1) ?? '{}')).toMatchObject({
      method: 'daemon.fork_session',
      params: { sessionId: 'session-alpha' },
    })

    socket.respond(getLastRequestId(socket), {
      newSessionId: 'session-beta',
    })

    await expect(result).resolves.toEqual({ newSessionId: 'session-beta' })
    await transport.stop()
  })

  it('sends daemon.rename_session with the selected title', async () => {
    const sockets: MockWebSocket[] = []
    const transport = createDaemonTransport({
      authProvider: {
        getApiKey: () => 'rename-key',
      },
      createWebSocket: (url) => {
        const socket = new MockWebSocket(url)
        sockets.push(socket)
        return socket
      },
      resolveCandidatePorts: async () => [37643],
      reconnectBaseDelayMs: 1_000,
      refreshIntervalMs: 60_000,
    })

    transport.start()
    await flushMicrotasks()

    sockets[0]?.open()
    await flushMicrotasks()
    const socket = getRequiredValue(sockets[0], 'Expected daemon socket')

    socket.respond(getLastRequestId(socket), { userId: 'user-1', orgId: 'org-1' })
    await flushMicrotasks()
    socket.respond(getLastRequestId(socket), {
      supportedMethods: [
        'daemon.list_opened_sessions',
        'daemon.list_available_sessions',
        'daemon.rename_session',
      ],
      supportedNotifications: [],
      sessions: [],
    })
    await flushMicrotasks()
    socket.respond(getLastRequestId(socket), {
      sessions: [],
      hasMore: false,
    })
    await flushMicrotasks()

    const result = transport.renameSession('session-alpha', 'Renamed session')

    expect(getSentMethods(socket).at(-1)).toBe('daemon.rename_session')
    expect(JSON.parse(socket.sentPayloads.at(-1) ?? '{}')).toMatchObject({
      method: 'daemon.rename_session',
      params: { sessionId: 'session-alpha', title: 'Renamed session' },
    })

    socket.respond(getLastRequestId(socket), {
      success: true,
    })

    await expect(result).resolves.toEqual({ success: true })
    await transport.stop()
  })

  it('enters reconnecting state on disconnect and retries with exponential backoff', async () => {
    const sockets: MockWebSocket[] = []
    const transport = createDaemonTransport({
      authProvider: {
        getApiKey: () => 'retry-key',
      },
      createWebSocket: (url) => {
        const socket = new MockWebSocket(url)
        sockets.push(socket)
        return socket
      },
      resolveCandidatePorts: async () => [37643],
      reconnectBaseDelayMs: 1_000,
      refreshIntervalMs: 60_000,
    })

    transport.start()
    await flushMicrotasks()

    sockets[0]?.open()
    await flushMicrotasks()
    const primarySocket = getRequiredValue(sockets[0], 'Expected primary daemon socket')

    primarySocket.respond(getLastRequestId(primarySocket), { userId: 'user-1' })
    await flushMicrotasks()
    primarySocket.respond(getLastRequestId(primarySocket), {
      supportedMethods: ['daemon.list_opened_sessions', 'daemon.list_available_sessions'],
      supportedNotifications: [],
      sessions: [],
    })
    await flushMicrotasks()
    primarySocket.respond(getLastRequestId(primarySocket), {
      sessions: [],
      hasMore: false,
    })
    await flushMicrotasks()

    sockets[0]?.serverClose()
    await flushMicrotasks()

    expect(transport.getStatus().status).toBe('reconnecting')
    expect(sockets).toHaveLength(1)

    await vi.advanceTimersByTimeAsync(999)
    expect(sockets).toHaveLength(1)

    await vi.advanceTimersByTimeAsync(1)
    await flushMicrotasks()
    expect(sockets).toHaveLength(2)

    sockets[1]?.open()
    await flushMicrotasks()
    const reconnectSocket = getRequiredValue(sockets[1], 'Expected reconnect daemon socket')

    reconnectSocket.respond(getLastRequestId(reconnectSocket), { userId: 'user-1' })
    await flushMicrotasks()
    reconnectSocket.respond(getLastRequestId(reconnectSocket), {
      supportedMethods: ['daemon.list_opened_sessions', 'daemon.list_available_sessions'],
      supportedNotifications: [],
      sessions: [],
    })
    await flushMicrotasks()
    reconnectSocket.respond(getLastRequestId(reconnectSocket), {
      sessions: [],
      hasMore: false,
    })
    await flushMicrotasks()

    expect(transport.getStatus().status).toBe('connected')

    await transport.stop()
  })

  it('does not emit a state change on refresh when daemon sessions are unchanged', async () => {
    const sockets: MockWebSocket[] = []
    const onStateChange = vi.fn()
    const transport = createDaemonTransport({
      authProvider: {
        getApiKey: () => 'steady-key',
      },
      createWebSocket: (url) => {
        const socket = new MockWebSocket(url)
        sockets.push(socket)
        return socket
      },
      resolveCandidatePorts: async () => [37643],
      reconnectBaseDelayMs: 1_000,
      refreshIntervalMs: 60_000,
      onStateChange,
    })

    transport.start()
    await flushMicrotasks()

    sockets[0]?.open()
    await flushMicrotasks()
    const socket = getRequiredValue(sockets[0], 'Expected daemon socket')

    socket.respond(getLastRequestId(socket), { userId: 'user-1' })
    await flushMicrotasks()
    socket.respond(getLastRequestId(socket), {
      supportedMethods: ['daemon.list_opened_sessions', 'daemon.list_available_sessions'],
      supportedNotifications: [],
      sessions: [
        {
          sessionId: 'daemon-opened',
          cwd: '/tmp/daemon-workspace',
          updatedAt: '2026-03-24T22:00:00.000Z',
          workingState: 'working',
          title: 'Daemon wins',
        },
      ],
    })
    await flushMicrotasks()
    socket.respond(getLastRequestId(socket), {
      sessions: [
        {
          sessionId: 'daemon-opened',
          cwd: '/tmp/daemon-workspace',
          title: 'Daemon wins',
          updatedAt: '2026-03-24T22:00:00.000Z',
        },
      ],
      hasMore: false,
    })
    await flushMicrotasks()

    expect(onStateChange).toHaveBeenCalledTimes(1)

    const refreshPromise = transport.refreshSessions()
    await flushMicrotasks()

    const sentMethods = getSentMethods(socket)
    expect(sentMethods.slice(-2)).toEqual([
      'daemon.list_opened_sessions',
      'daemon.list_available_sessions',
    ])

    const requestIdsByMethod = getRequestIdsByMethod(socket)
    const openedRequestId = requestIdsByMethod['daemon.list_opened_sessions']?.at(-1)
    const availableRequestId = requestIdsByMethod['daemon.list_available_sessions']?.at(-1)

    socket.respond(getRequiredValue(openedRequestId, 'Expected opened sessions refresh request'), {
      sessions: [
        {
          sessionId: 'daemon-opened',
          cwd: '/tmp/daemon-workspace',
          title: 'Daemon wins',
          updatedAt: '2026-03-24T22:00:00.000Z',
          workingState: 'working',
        },
      ],
      supportedMethods: ['daemon.list_opened_sessions', 'daemon.list_available_sessions'],
      supportedNotifications: [],
    })
    await flushMicrotasks()
    socket.respond(
      getRequiredValue(availableRequestId, 'Expected available sessions refresh request'),
      {
        sessions: [
          {
            sessionId: 'daemon-opened',
            cwd: '/tmp/daemon-workspace',
            title: 'Daemon wins',
            updatedAt: '2026-03-24T22:00:00.000Z',
          },
        ],
        hasMore: false,
      },
    )
    await refreshPromise

    expect(onStateChange).toHaveBeenCalledTimes(1)

    await transport.stop()
  })

  it('does not emit redundant reconnect state updates when the snapshot is unchanged', async () => {
    const onStateChange = vi.fn()
    const transport = createDaemonTransport({
      authProvider: {},
      resolveCandidatePorts: async () => [37643],
      reconnectBaseDelayMs: 1_000,
      reconnectMaxDelayMs: 1_000,
      refreshIntervalMs: 60_000,
      onStateChange,
    })

    transport.start()
    await flushMicrotasks()

    expect(onStateChange).toHaveBeenCalledTimes(1)
    expect(onStateChange).toHaveBeenLastCalledWith(
      expect.objectContaining({
        status: 'disconnected',
        lastError: 'Daemon authentication credentials are unavailable.',
        nextRetryDelayMs: 1_000,
      }),
      [],
    )

    await vi.advanceTimersByTimeAsync(1_000)
    await flushMicrotasks()

    expect(onStateChange).toHaveBeenCalledTimes(1)

    await transport.stop()
  })
})
