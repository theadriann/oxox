import { type DroidClientTransport, protocol, SDK_TAG } from '@factory/droid-sdk'
import { describe, expect, it, vi } from 'vitest'

import type { ResolvedDaemonCredentials } from '../daemon/auth'
import { DroidSdkDaemonSessionTransport } from '../droidSdk/daemonTransport'
import type { StreamJsonRpcProcessTransportLike } from '../sessions/types'

class FakeDaemonWebSocketTransport implements DroidClientTransport {
  isConnected = false
  connectCalls: string[] = []
  closeCalls = 0
  sentMessages: Array<Record<string, unknown>> = []
  readonly rpcResults = new Map<string, unknown>()

  private messageHandler: ((message: Record<string, unknown>) => void) | null = null
  private errorHandler: ((error: Error) => void) | null = null

  async connect(url?: string): Promise<void> {
    this.connectCalls.push(url ?? '')
    this.isConnected = true
  }

  send(message: Record<string, unknown>): void {
    this.sentMessages.push(message)

    if (message.type === 'request' && typeof message.method === 'string') {
      const result = this.rpcResults.get(message.method)

      if (result) {
        queueMicrotask(() => {
          this.emitMessage({
            type: 'response',
            id: message.id,
            result,
          })
        })
      }
    }
  }

  onMessage(callback: (message: Record<string, unknown>) => void): void {
    this.messageHandler = callback
  }

  onError(callback: (error: Error) => void): void {
    this.errorHandler = callback
  }

  async close(): Promise<void> {
    this.closeCalls += 1
    this.isConnected = false
  }

  emitMessage(message: Record<string, unknown>): void {
    this.messageHandler?.(message)
  }

  emitError(error: Error): void {
    this.errorHandler?.(error)
  }
}

function requireTransportMethod<TName extends keyof StreamJsonRpcProcessTransportLike>(
  transport: StreamJsonRpcProcessTransportLike,
  name: TName,
): NonNullable<StreamJsonRpcProcessTransportLike[TName]> {
  const method = transport[name]

  expect(typeof method).toBe('function')

  return method as NonNullable<StreamJsonRpcProcessTransportLike[TName]>
}

class FakeDaemonClient {
  sessionId: string | null = null
  initializeSessionCalls: Array<Record<string, unknown>> = []
  loadSessionCalls: Array<Record<string, unknown>> = []
  addUserMessageCalls: Array<Record<string, unknown>> = []
  interruptSessionCalls = 0
  closeCalls = 0

  private notificationHandler: ((notification: Record<string, unknown>) => void) | null = null
  private permissionHandler:
    | ((params: Record<string, unknown>) => Promise<string> | string)
    | null = null

  async initializeSession(params: Record<string, unknown>) {
    this.initializeSessionCalls.push(params)
    this.sessionId = 'daemon-session-1'

    return {
      sessionId: 'daemon-session-1',
      session: { messages: [] },
      settings: { modelId: 'gpt-5.5' },
      availableModels: [{ id: 'gpt-5.5', displayName: 'GPT 5.5', modelProvider: 'openai' }],
      cwd: '/tmp/project',
      isAgentLoopInProgress: false,
    }
  }

  async loadSession(params: Record<string, unknown>) {
    this.loadSessionCalls.push(params)
    this.sessionId = String(params.sessionId)

    return {
      session: { messages: [] },
      settings: { modelId: 'gpt-5.5' },
      availableModels: [{ id: 'gpt-5.5', displayName: 'GPT 5.5', modelProvider: 'openai' }],
      cwd: '/tmp/project',
      isAgentLoopInProgress: true,
    }
  }

  async addUserMessage(params: Record<string, unknown>) {
    this.addUserMessageCalls.push(params)
    return {}
  }

  async interruptSession() {
    this.interruptSessionCalls += 1
    return {}
  }

  onNotification(callback: (notification: Record<string, unknown>) => void): () => void {
    this.notificationHandler = callback
    return () => {
      this.notificationHandler = null
    }
  }

  setPermissionHandler(callback: (params: Record<string, unknown>) => Promise<string> | string) {
    this.permissionHandler = callback
  }

  setAskUserHandler() {}

  async close() {
    this.closeCalls += 1
  }

  emitNotification(notification: Record<string, unknown>): void {
    this.notificationHandler?.(notification)
  }

  requestPermission(params: Record<string, unknown>): Promise<string> {
    if (!this.permissionHandler) {
      throw new Error('permission handler was not registered')
    }

    return Promise.resolve(this.permissionHandler(params))
  }
}

function withTimeout<T>(promise: Promise<T>, timeoutMs = 100): Promise<T | '__timeout__'> {
  return Promise.race([
    promise,
    new Promise<'__timeout__'>((resolve) => {
      setTimeout(() => resolve('__timeout__'), timeoutMs)
    }),
  ])
}

describe('DroidSdkDaemonSessionTransport', () => {
  it('connects through SDK daemon primitives and initializes a daemon session', async () => {
    const socketTransport = new FakeDaemonWebSocketTransport()
    const daemonClient = new FakeDaemonClient()
    const authenticated: ResolvedDaemonCredentials[] = []
    const ensureLocalDaemon = vi.fn(async () => ({ port: 37_643 }))
    const resolveWebSocketUrl = vi.fn(() => 'ws://127.0.0.1:37643')

    const transport = new DroidSdkDaemonSessionTransport({
      authProvider: { getApiKey: () => 'factory-key' },
      cwd: '/tmp/project',
      createDaemonClient: () => daemonClient,
      createWebSocketTransport: () => socketTransport,
      ensureLocalDaemon,
      resolveWebSocketUrl,
      authenticateConnection: async (_connection, credentials) => {
        authenticated.push(credentials)
      },
    })

    const result = await transport.initializeSession('request-1', {
      cwd: '/tmp/project',
      settings: {
        autonomyLevel: 'medium',
        interactionMode: 'auto',
        modelId: 'gpt-5.4',
        reasoningEffort: 'high',
      },
    })

    expect(ensureLocalDaemon).toHaveBeenCalledTimes(1)
    expect(resolveWebSocketUrl).toHaveBeenCalledWith({
      apiKey: 'factory-key',
      daemonPort: 37_643,
    })
    expect(socketTransport.connectCalls).toEqual(['ws://127.0.0.1:37643'])
    expect(authenticated).toEqual([{ caller: 'oxox', apiKey: 'factory-key' }])
    expect(daemonClient.initializeSessionCalls).toEqual([
      {
        machineId: 'oxox-electron',
        cwd: '/tmp/project',
        autonomyLevel: 'medium',
        interactionMode: 'auto',
        modelId: 'gpt-5.4',
        reasoningEffort: 'high',
        tags: [SDK_TAG],
      },
    ])
    expect(result.sessionId).toBe('daemon-session-1')
    expect(result.cwd).toBe('/tmp/project')
    expect(result.isAgentLoopInProgress).toBe(false)
  })

  it('emits normalized stream events from daemon session notifications', async () => {
    const daemonClient = new FakeDaemonClient()
    const transport = new DroidSdkDaemonSessionTransport({
      authProvider: { getApiKey: () => 'factory-key' },
      createDaemonClient: () => daemonClient,
      createWebSocketTransport: () => new FakeDaemonWebSocketTransport(),
      ensureLocalDaemon: async () => ({ port: 37_643 }),
      resolveWebSocketUrl: () => 'ws://127.0.0.1:37643',
      authenticateConnection: async () => undefined,
    })
    const events: Array<{ type: string; content?: string }> = []
    transport.subscribe((event) => {
      events.push(event as { type: string; content?: string })
    })

    await transport.loadSession('request-1', 'daemon-session-1')
    daemonClient.emitNotification({
      params: {
        notification: {
          type: 'assistant_text_delta',
          messageId: 'message-1',
          blockIndex: 0,
          textDelta: 'hello',
        },
      },
    })

    await vi.waitFor(() => {
      expect(events).toContainEqual(
        expect.objectContaining({
          type: 'message.delta',
          delta: 'hello',
        }),
      )
    })
  })

  it('passes queued user messages through the daemon SDK client seam', async () => {
    const daemonClient = new FakeDaemonClient()
    const transport = new DroidSdkDaemonSessionTransport({
      authProvider: { getApiKey: () => 'factory-key' },
      createDaemonClient: () => daemonClient,
      createWebSocketTransport: () => new FakeDaemonWebSocketTransport(),
      ensureLocalDaemon: async () => ({ port: 37_643 }),
      resolveWebSocketUrl: () => 'ws://127.0.0.1:37643',
      authenticateConnection: async () => undefined,
    })

    await transport.addUserMessage('message-1', {
      text: 'Continue after this finishes',
      queuePlacement: 'end_of_turn',
    })

    expect(daemonClient.addUserMessageCalls).toEqual([
      {
        text: 'Continue after this finishes',
        queuePlacement: 'end_of_turn',
        messageId: expect.any(String),
      },
    ])
  })

  it('preserves daemon server request ids for permission resolution', async () => {
    const socketTransport = new FakeDaemonWebSocketTransport()
    const daemonClient = new FakeDaemonClient()
    const transport = new DroidSdkDaemonSessionTransport({
      authProvider: { getApiKey: () => 'factory-key' },
      createDaemonClient: () => daemonClient,
      createWebSocketTransport: () => socketTransport,
      ensureLocalDaemon: async () => ({ port: 37_643 }),
      resolveWebSocketUrl: () => 'ws://127.0.0.1:37643',
      authenticateConnection: async () => undefined,
    })
    const events: Array<{ type: string; requestId?: string }> = []
    transport.subscribe((event) => {
      events.push(event as { type: string; requestId?: string })
    })

    await transport.loadSession('request-1', 'daemon-session-1')
    socketTransport.emitMessage({
      type: 'request',
      id: 'daemon-permission-1',
      method: 'daemon.request_permission',
      params: {},
    })
    const permission = daemonClient.requestPermission({
      options: [{ value: 'allow', label: 'Allow' }],
      toolUses: [{ toolUse: { id: 'tool-use-1' } }],
    })
    await vi.waitFor(() => {
      expect(events).toContainEqual(
        expect.objectContaining({
          type: 'permission.requested',
          requestId: 'daemon-permission-1',
        }),
      )
    })

    await transport.resolvePermissionRequest('daemon-permission-1', 'allow')

    await expect(permission).resolves.toBe('allow')
  })

  it('keeps daemon permission handlers pending when emitting the request event fails', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const socketTransport = new FakeDaemonWebSocketTransport()
    const daemonClient = new FakeDaemonClient()
    const transport = new DroidSdkDaemonSessionTransport({
      authProvider: { getApiKey: () => 'factory-key' },
      createDaemonClient: () => daemonClient,
      createWebSocketTransport: () => socketTransport,
      authenticateConnection: async () => undefined,
    })

    transport.subscribe((event) => {
      if (event.type === 'permission.requested') {
        throw new Error('renderer bridge failed')
      }
    })

    try {
      await transport.loadSession('request-1', 'daemon-session-1')
      socketTransport.emitMessage({
        type: 'request',
        id: 'daemon-permission-1',
        method: 'daemon.request_permission',
        params: {},
      })
      const permission = daemonClient.requestPermission({
        options: [{ value: 'proceed_once', label: 'Allow' }],
        toolUses: [{ toolUse: { id: 'tool-use-1' } }],
      })

      await vi.waitFor(() => {
        expect(consoleError).toHaveBeenCalled()
      })
      await expect(withTimeout(permission)).resolves.toBe('__timeout__')

      await transport.resolvePermissionRequest('daemon-permission-1', 'proceed_once')

      await expect(permission).resolves.toBe('proceed_once')
    } finally {
      consoleError.mockRestore()
    }
  })

  it('uses SDK daemon protocol methods for MCP registry, auth, tools, workers, and bug reports', async () => {
    const socketTransport = new FakeDaemonWebSocketTransport()
    const daemonClient = new FakeDaemonClient()
    const methods = protocol.daemon.DaemonDroidMethod
    socketTransport.rpcResults.set(methods.LIST_MCP_REGISTRY, {
      servers: [
        {
          name: 'linear',
          description: 'Linear MCP',
          type: 'http',
          url: 'https://mcp.linear.app/mcp',
        },
      ],
    })
    socketTransport.rpcResults.set(methods.CANCEL_MCP_AUTH, { success: true })
    socketTransport.rpcResults.set(methods.CLEAR_MCP_AUTH, { success: true })
    socketTransport.rpcResults.set(methods.SUBMIT_MCP_AUTH_CODE, { success: true })
    socketTransport.rpcResults.set(methods.TOGGLE_MCP_TOOL, { success: true })
    socketTransport.rpcResults.set(methods.KILL_WORKER_SESSION, {})
    socketTransport.rpcResults.set(methods.SUBMIT_BUG_REPORT, {
      bugReportId: 'bug-report-1',
    })
    const transport = new DroidSdkDaemonSessionTransport({
      authProvider: { getApiKey: () => 'factory-key' },
      createDaemonClient: () => daemonClient,
      createWebSocketTransport: () => socketTransport,
      ensureLocalDaemon: async () => ({ port: 37_643 }),
      resolveWebSocketUrl: () => 'ws://127.0.0.1:37643',
      authenticateConnection: async () => undefined,
    }) as StreamJsonRpcProcessTransportLike

    await transport.loadSession('request-1', 'daemon-session-1')

    await expect(
      requireTransportMethod(transport, 'listMcpRegistry').call(transport, 'request-2'),
    ).resolves.toEqual([
      {
        name: 'linear',
        description: 'Linear MCP',
        type: 'http',
        url: 'https://mcp.linear.app/mcp',
      },
    ])
    await requireTransportMethod(transport, 'cancelMcpAuth').call(transport, 'request-3', 'linear')
    await requireTransportMethod(transport, 'clearMcpAuth').call(transport, 'request-4', 'linear')
    await requireTransportMethod(transport, 'submitMcpAuthCode').call(transport, 'request-5', {
      serverName: 'linear',
      code: 'oauth-code',
      state: 'oauth-state',
    })
    await requireTransportMethod(transport, 'toggleMcpTool').call(
      transport,
      'request-6',
      'linear',
      'create_issue',
      false,
    )
    await requireTransportMethod(transport, 'killWorkerSession').call(
      transport,
      'request-7',
      'worker-session-1',
    )
    await expect(
      requireTransportMethod(transport, 'submitBugReport').call(transport, 'request-8', {
        userComment: 'Bug report',
        clientLogs: 'renderer log',
      }),
    ).resolves.toEqual({ bugReportId: 'bug-report-1' })

    expect(socketTransport.sentMessages).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          method: methods.LIST_MCP_REGISTRY,
          params: { sessionId: 'daemon-session-1' },
        }),
        expect.objectContaining({
          method: methods.CANCEL_MCP_AUTH,
          params: { sessionId: 'daemon-session-1', serverName: 'linear' },
        }),
        expect.objectContaining({
          method: methods.CLEAR_MCP_AUTH,
          params: { sessionId: 'daemon-session-1', serverName: 'linear' },
        }),
        expect.objectContaining({
          method: methods.SUBMIT_MCP_AUTH_CODE,
          params: {
            sessionId: 'daemon-session-1',
            serverName: 'linear',
            code: 'oauth-code',
            state: 'oauth-state',
          },
        }),
        expect.objectContaining({
          method: methods.TOGGLE_MCP_TOOL,
          params: {
            sessionId: 'daemon-session-1',
            serverName: 'linear',
            toolName: 'create_issue',
            enabled: false,
          },
        }),
        expect.objectContaining({
          method: methods.KILL_WORKER_SESSION,
          params: {
            sessionId: 'daemon-session-1',
            workerSessionId: 'worker-session-1',
          },
        }),
        expect.objectContaining({
          method: methods.SUBMIT_BUG_REPORT,
          params: {
            sessionId: 'daemon-session-1',
            userComment: 'Bug report',
            clientLogs: 'renderer log',
          },
        }),
      ]),
    )
  })

  it('uses SDK daemon protocol methods for queued-message resolution and cache warmup', async () => {
    const socketTransport = new FakeDaemonWebSocketTransport()
    const daemonClient = new FakeDaemonClient()
    const methods = protocol.daemon.DaemonDroidMethod
    socketTransport.rpcResults.set(methods.RESOLVE_QUEUED_USER_MESSAGE, {})
    socketTransport.rpcResults.set(methods.WARMUP_CACHE, {})
    const transport = new DroidSdkDaemonSessionTransport({
      authProvider: { getApiKey: () => 'factory-key' },
      createDaemonClient: () => daemonClient,
      createWebSocketTransport: () => socketTransport,
      ensureLocalDaemon: async () => ({ port: 37_643 }),
      resolveWebSocketUrl: () => 'ws://127.0.0.1:37643',
      authenticateConnection: async () => undefined,
    }) as StreamJsonRpcProcessTransportLike

    await transport.loadSession('request-1', 'daemon-session-1')

    await requireTransportMethod(transport, 'resolveQueuedUserMessage').call(
      transport,
      'request-2',
      {
        requestId: 'queued-user-message-1',
        action: 'update_queue',
        queuePlacement: 'end_of_loop',
      },
    )
    await requireTransportMethod(transport, 'warmupCache').call(transport, 'request-3')

    expect(socketTransport.sentMessages).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          method: methods.RESOLVE_QUEUED_USER_MESSAGE,
          params: {
            sessionId: 'daemon-session-1',
            requestId: 'queued-user-message-1',
            action: 'update_queue',
            queuePlacement: 'end_of_loop',
          },
        }),
        expect.objectContaining({
          method: methods.WARMUP_CACHE,
          params: { sessionId: 'daemon-session-1' },
        }),
      ]),
    )
  })
})
