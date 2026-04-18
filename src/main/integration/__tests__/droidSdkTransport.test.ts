import {
  type DroidClient,
  type DroidClientTransport,
  ProcessExitError,
  SDK_TAG,
} from '@factory/droid-sdk'
import { describe, expect, it } from 'vitest'

import type { DroidSdkSessionFactory } from '../droidSdk/factory'
import { DroidSdkSessionTransport } from '../droidSdk/transport'

function waitFor(predicate: () => boolean, timeoutMs = 2_000): Promise<void> {
  const deadline = Date.now() + timeoutMs

  return new Promise((resolve, reject) => {
    const tick = () => {
      if (predicate()) {
        resolve()
        return
      }

      if (Date.now() >= deadline) {
        reject(new Error(`timed out after ${timeoutMs}ms`))
        return
      }

      setTimeout(tick, 10)
    }

    tick()
  })
}

class FakeDroidClientTransport implements DroidClientTransport {
  readonly childProcess = {
    pid: 4_321,
  }

  connectCalls = 0
  closeCalls = 0
  isConnected = false
  readonly sentMessages: object[] = []

  private messageHandler: ((message: object) => void) | null = null
  private errorHandler: ((error: Error) => void) | null = null

  async connect(): Promise<void> {
    this.connectCalls += 1
    this.isConnected = true
  }

  send(message: object): void {
    this.sentMessages.push(message)
  }

  onMessage(callback: (message: object) => void): void {
    this.messageHandler = callback
  }

  onError(callback: (error: Error) => void): void {
    this.errorHandler = callback
  }

  async close(): Promise<void> {
    this.closeCalls += 1
    this.isConnected = false
  }

  emitMessage(message: object): void {
    this.messageHandler?.(message)
  }

  emitError(error: Error): void {
    this.errorHandler?.(error)
  }
}

class FakeDroidClient {
  sessionId: string | null = null

  readonly initializeSessionCalls: Array<Record<string, unknown>> = []
  readonly loadSessionCalls: Array<Record<string, unknown>> = []
  readonly addUserMessageCalls: Array<Record<string, unknown>> = []
  readonly updateSessionSettingsCalls: Array<Record<string, unknown>> = []
  readonly getRewindInfoCalls: Array<Record<string, unknown>> = []
  readonly executeRewindCalls: Array<Record<string, unknown>> = []
  readonly compactSessionCalls: Array<Record<string, unknown>> = []
  readonly renameSessionCalls: Array<Record<string, unknown>> = []
  listMcpServersCalls = 0
  listSkillsCalls = 0
  listToolsCalls = 0
  forkSessionCalls = 0
  interruptSessionCalls = 0
  closeCalls = 0

  private notificationHandler: ((notification: Record<string, unknown>) => void) | null = null
  private permissionHandler:
    | ((params: Record<string, unknown>) => Promise<string> | string)
    | null = null
  private askUserHandler:
    | ((
        params: Record<string, unknown>,
      ) => Promise<Record<string, unknown>> | Record<string, unknown>)
    | null = null

  async initializeSession(params: Record<string, unknown>) {
    this.initializeSessionCalls.push(params)
    this.sessionId = 'session-1'

    return {
      sessionId: 'session-1',
      session: { messages: [] },
      settings: {
        modelId: 'gpt-5.4',
        reasoningEffort: 'medium',
      },
      availableModels: [
        {
          id: 'gpt-5.4',
          displayName: 'GPT 5.4',
          shortDisplayName: 'GPT 5.4',
          modelProvider: 'openai',
          supportedReasoningEfforts: ['medium', 'high'],
          defaultReasoningEffort: 'medium',
        },
      ],
    }
  }

  async loadSession(params: Record<string, unknown>) {
    this.loadSessionCalls.push(params)
    this.sessionId = String(params.sessionId ?? '')

    return {
      session: { messages: [] },
      settings: {
        modelId: 'gpt-5.4',
        reasoningEffort: 'medium',
      },
      availableModels: [
        {
          id: 'gpt-5.4',
          displayName: 'GPT 5.4',
          shortDisplayName: 'GPT 5.4',
          modelProvider: 'openai',
          supportedReasoningEfforts: ['medium', 'high'],
          defaultReasoningEffort: 'medium',
        },
      ],
      cwd: '/tmp/session-1',
      isAgentLoopInProgress: false,
    }
  }

  async addUserMessage(params: Record<string, unknown>) {
    this.addUserMessageCalls.push(params)
    return {}
  }

  async updateSessionSettings(params: Record<string, unknown>) {
    this.updateSessionSettingsCalls.push(params)
    return {}
  }

  async interruptSession() {
    this.interruptSessionCalls += 1
    return {}
  }

  async getRewindInfo(params: Record<string, unknown>) {
    this.getRewindInfoCalls.push(params)
    return {
      availableFiles: [
        {
          filePath: '/tmp/project/src/index.ts',
          contentHash: 'abc123',
          size: 42,
        },
      ],
      createdFiles: [{ filePath: '/tmp/project/new-file.ts' }],
      evictedFiles: [{ filePath: '/tmp/project/old-file.ts', reason: 'outside rewind window' }],
    }
  }

  async executeRewind(params: Record<string, unknown>) {
    this.executeRewindCalls.push(params)
    return {
      newSessionId: 'session-1-rewind',
      restoredCount: 1,
      deletedCount: 1,
      failedRestoreCount: 0,
      failedDeleteCount: 0,
    }
  }

  async compactSession(params: Record<string, unknown>) {
    this.compactSessionCalls.push(params)
    return {
      newSessionId: 'session-1-compact',
      removedCount: 3,
    }
  }

  async renameSession(params: Record<string, unknown>) {
    this.renameSessionCalls.push(params)
    return {
      success: true,
    }
  }

  async listTools() {
    this.listToolsCalls += 1
    return {
      tools: [
        {
          id: 'tool-read',
          llmId: 'Read',
          displayName: 'Read',
          description: 'Read a file',
          category: 'read',
          defaultAllowed: true,
          currentlyAllowed: true,
        },
      ],
    }
  }

  async listSkills() {
    this.listSkillsCalls += 1
    return {
      skills: [
        {
          name: 'vault-knowledge',
          description: 'Search the project vault',
          location: 'personal',
          filePath: '/Users/test/.factory/skills/vault-knowledge/SKILL.md',
          enabled: true,
          userInvocable: true,
        },
      ],
    }
  }

  async listMcpServers() {
    this.listMcpServersCalls += 1
    return {
      servers: [
        {
          name: 'figma',
          status: 'connected',
          source: 'user',
          isManaged: false,
          toolCount: 12,
          serverType: 'http',
          hasAuthTokens: true,
        },
      ],
    }
  }

  async forkSession() {
    this.forkSessionCalls += 1
    return {
      newSessionId: 'session-1-fork',
    }
  }

  onNotification(callback: (notification: Record<string, unknown>) => void): () => void {
    this.notificationHandler = callback

    return () => {
      this.notificationHandler = null
    }
  }

  setPermissionHandler(
    handler: (params: Record<string, unknown>) => Promise<string> | string,
  ): void {
    this.permissionHandler = handler
  }

  setAskUserHandler(
    handler:
      | ((
          params: Record<string, unknown>,
        ) => Promise<Record<string, unknown>> | Record<string, unknown>)
      | null,
  ): void {
    this.askUserHandler = handler
  }

  async close(): Promise<void> {
    this.closeCalls += 1
  }

  emitNotification(notification: Record<string, unknown>): void {
    this.notificationHandler?.(notification)
  }

  requestPermission(
    requestId: string,
    params: Record<string, unknown>,
    transport: FakeDroidClientTransport,
  ) {
    transport.emitMessage({
      jsonrpc: '2.0',
      type: 'request',
      id: requestId,
      method: 'droid.request_permission',
      params,
    })

    return Promise.resolve(this.permissionHandler?.(params))
  }

  askUser(requestId: string, params: Record<string, unknown>, transport: FakeDroidClientTransport) {
    transport.emitMessage({
      jsonrpc: '2.0',
      type: 'request',
      id: requestId,
      method: 'droid.ask_user',
      params,
    })

    return Promise.resolve(this.askUserHandler?.(params))
  }
}

function createSessionFactory(transport: FakeDroidClientTransport, client: FakeDroidClient) {
  return {
    createTransport: () => transport,
    createClient: () => client as unknown as DroidClient,
  } satisfies DroidSdkSessionFactory
}

describe('DroidSdkSessionTransport', () => {
  it('connects through the SDK seam and maps session notifications into OXOX events', async () => {
    const transport = new FakeDroidClientTransport()
    const client = new FakeDroidClient()
    const sessionTransport = new DroidSdkSessionTransport(
      {
        cwd: '/tmp/session-1',
        droidPath: '/opt/factory/bin/droid',
        sessionId: null,
      },
      createSessionFactory(transport, client),
    )

    const events: Array<{ type: string }> = []
    sessionTransport.subscribe((event) => {
      events.push(event as { type: string })
    })

    const result = await sessionTransport.initializeSession('session:create:1', '/tmp/session-1')

    expect(result).toMatchObject({
      sessionId: 'session-1',
      settings: {
        modelId: 'gpt-5.4',
      },
    })
    expect(transport.connectCalls).toBe(1)
    expect(sessionTransport.processId).toBe(4_321)
    expect(client.initializeSessionCalls).toEqual([
      {
        machineId: 'oxox-electron',
        cwd: '/tmp/session-1',
        tags: [SDK_TAG],
      },
    ])

    client.emitNotification({
      params: {
        notification: {
          type: 'assistant_text_delta',
          messageId: 'message-1',
          blockIndex: 0,
          textDelta: 'Hello there',
        },
      },
    })
    client.emitNotification({
      params: {
        notification: {
          type: 'settings_updated',
          settings: {
            modelId: 'gpt-5.4-mini',
          },
        },
      },
    })

    await waitFor(() => events.length === 2)

    expect(events).toEqual([
      expect.objectContaining({
        type: 'message.delta',
        messageId: 'message-1',
        delta: 'Hello there',
      }),
      expect.objectContaining({
        type: 'session.settingsChanged',
        settings: {
          modelId: 'gpt-5.4-mini',
        },
      }),
    ])
  })

  it('maps tool results embedded in create_message payloads so live tool rows complete cleanly', async () => {
    const transport = new FakeDroidClientTransport()
    const client = new FakeDroidClient()
    const sessionTransport = new DroidSdkSessionTransport(
      {
        cwd: '/tmp/session-1',
        droidPath: '/opt/factory/bin/droid',
        sessionId: null,
      },
      createSessionFactory(transport, client),
    )

    const events: Array<Record<string, unknown>> = []
    sessionTransport.subscribe((event) => {
      events.push(event as Record<string, unknown>)
    })

    await sessionTransport.initializeSession('session:create:1', '/tmp/session-1')

    client.emitNotification({
      params: {
        notification: {
          type: 'create_message',
          message: {
            id: 'assistant-tool-1',
            role: 'assistant',
            createdAt: 1,
            updatedAt: 1,
            content: [
              {
                type: 'tool_use',
                id: 'tool-1',
                name: 'Skill',
                input: { skill: 'vault-knowledge' },
              },
            ],
          },
        },
      },
    })
    client.emitNotification({
      params: {
        notification: {
          type: 'create_message',
          message: {
            id: 'user-tool-result-1',
            role: 'user',
            createdAt: 2,
            updatedAt: 2,
            content: [
              {
                type: 'tool_result',
                toolUseId: 'tool-1',
                isError: false,
                content: 'Skill "vault-knowledge" is now active.',
              },
            ],
          },
        },
      },
    })

    await waitFor(() => events.length === 2)

    expect(events).toEqual([
      {
        type: 'tool.progress',
        sessionId: 'session-1',
        toolUseId: 'tool-1',
        toolName: 'Skill',
        status: 'running',
        detail: '```json\n{\n  "skill": "vault-knowledge"\n}\n```',
      },
      {
        type: 'tool.result',
        sessionId: 'session-1',
        toolUseId: 'tool-1',
        toolName: 'Skill',
        content: 'Skill "vault-knowledge" is now active.',
        isError: false,
      },
    ])
  })

  it('holds SDK permission handlers open until OXOX resolves the request', async () => {
    const transport = new FakeDroidClientTransport()
    const client = new FakeDroidClient()
    const sessionTransport = new DroidSdkSessionTransport(
      {
        cwd: '/tmp/session-1',
        droidPath: '/opt/factory/bin/droid',
        sessionId: 'session-1',
      },
      createSessionFactory(transport, client),
    )

    const events: Array<{ type: string }> = []
    sessionTransport.subscribe((event) => {
      events.push(event as { type: string })
    })

    const permissionParams = {
      toolUses: [
        {
          toolUse: {
            id: 'tool-1',
            name: 'Execute',
          },
          details: {
            type: 'exec',
            fullCommand: 'npm publish',
            impactLevel: 'high',
          },
        },
      ],
      options: [
        { label: 'Approve', value: 'proceed_once' },
        { label: 'Deny', value: 'cancel' },
      ],
    }

    const resolutionPromise = client.requestPermission('permission-1', permissionParams, transport)

    await waitFor(() => events.some((event) => event.type === 'permission.requested'))

    await sessionTransport.resolvePermissionRequest('permission-1', 'proceed_once')

    await expect(resolutionPromise).resolves.toBe('proceed_once')
    expect(events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: 'permission.requested',
          requestId: 'permission-1',
          reason: 'npm publish',
          riskLevel: 'high',
        }),
        expect.objectContaining({
          type: 'permission.resolved',
          requestId: 'permission-1',
          selectedOption: 'proceed_once',
        }),
      ]),
    )
  })

  it('holds SDK ask-user handlers open until OXOX submits an answer', async () => {
    const transport = new FakeDroidClientTransport()
    const client = new FakeDroidClient()
    const sessionTransport = new DroidSdkSessionTransport(
      {
        cwd: '/tmp/session-1',
        droidPath: '/opt/factory/bin/droid',
        sessionId: 'session-1',
      },
      createSessionFactory(transport, client),
    )

    const events: Array<{ type: string }> = []
    sessionTransport.subscribe((event) => {
      events.push(event as { type: string })
    })

    const askUserPromise = client.askUser(
      'ask-1',
      {
        questions: [
          {
            index: 0,
            question: 'Which word should I answer with?',
            options: ['ALPHA', 'BETA'],
          },
          {
            index: 1,
            question: 'Should I continue?',
            options: ['YES', 'NO'],
          },
        ],
      },
      transport,
    )

    await waitFor(() => events.some((event) => event.type === 'askUser.requested'))

    await sessionTransport.resolveAskUserRequest('ask-1', [
      {
        index: 0,
        question: 'Which word should I answer with?',
        answer: 'ALPHA',
      },
      {
        index: 1,
        question: 'Should I continue?',
        answer: 'YES',
      },
    ])

    await expect(askUserPromise).resolves.toEqual({
      cancelled: false,
      answers: [
        {
          index: 0,
          question: 'Which word should I answer with?',
          answer: 'ALPHA',
        },
        {
          index: 1,
          question: 'Should I continue?',
          answer: 'YES',
        },
      ],
    })
    expect(events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: 'askUser.requested',
          requestId: 'ask-1',
          prompt: 'Which word should I answer with?',
          options: ['ALPHA', 'BETA'],
          questions: [
            {
              index: 0,
              question: 'Which word should I answer with?',
              options: ['ALPHA', 'BETA'],
            },
            {
              index: 1,
              question: 'Should I continue?',
              options: ['YES', 'NO'],
            },
          ],
        }),
        expect.objectContaining({
          type: 'askUser.resolved',
          requestId: 'ask-1',
          selectedOption: 'ALPHA',
          answers: [
            {
              index: 0,
              question: 'Which word should I answer with?',
              answer: 'ALPHA',
            },
            {
              index: 1,
              question: 'Should I continue?',
              answer: 'YES',
            },
          ],
        }),
      ]),
    )
  })

  it('translates transport failures into reconnectable stream errors', async () => {
    const transport = new FakeDroidClientTransport()
    const client = new FakeDroidClient()
    const sessionTransport = new DroidSdkSessionTransport(
      {
        cwd: '/tmp/session-1',
        droidPath: '/opt/factory/bin/droid',
        sessionId: 'session-1',
      },
      createSessionFactory(transport, client),
    )

    const events: Array<{ type: string }> = []
    sessionTransport.subscribe((event) => {
      events.push(event as { type: string })
    })

    transport.emitError(new ProcessExitError('Droid process exited unexpectedly', { exitCode: 17 }))

    await waitFor(() => events.length === 1)

    expect(events).toEqual([
      expect.objectContaining({
        type: 'stream.error',
        recoverable: true,
      }),
    ])
  })

  it('emits a completion event when the SDK stream returns to idle', async () => {
    const transport = new FakeDroidClientTransport()
    const client = new FakeDroidClient()
    const sessionTransport = new DroidSdkSessionTransport(
      {
        cwd: '/tmp/session-1',
        droidPath: '/opt/factory/bin/droid',
        sessionId: 'session-1',
      },
      createSessionFactory(transport, client),
    )

    const events: Array<{ type: string }> = []
    sessionTransport.subscribe((event) => {
      events.push(event as { type: string })
    })

    client.emitNotification({
      params: {
        notification: {
          type: 'droid_working_state_changed',
          newState: 'executing_tool',
        },
      },
    })
    client.emitNotification({
      params: {
        notification: {
          type: 'droid_working_state_changed',
          newState: 'idle',
        },
      },
    })

    await waitFor(() => events.some((event) => event.type === 'stream.completed'))

    expect(events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: 'session.statusChanged',
          status: 'executing_tool',
        }),
        expect.objectContaining({
          type: 'stream.completed',
          reason: 'completed',
        }),
      ]),
    )
  })

  it('delegates rewind, compact, and fork operations to the SDK client', async () => {
    const transport = new FakeDroidClientTransport()
    const client = new FakeDroidClient()
    const sessionTransport = new DroidSdkSessionTransport(
      {
        cwd: '/tmp/session-1',
        droidPath: '/opt/factory/bin/droid',
        sessionId: 'session-1',
      },
      createSessionFactory(transport, client),
    )

    const rewindInfoPromise = sessionTransport.getRewindInfo('rewind:info:1', 'message-1')
    await waitFor(() => client.getRewindInfoCalls.length === 1)

    expect(client.getRewindInfoCalls).toEqual([{ messageId: 'message-1' }])

    await expect(rewindInfoPromise).resolves.toEqual({
      availableFiles: [
        {
          filePath: '/tmp/project/src/index.ts',
          contentHash: 'abc123',
          size: 42,
        },
      ],
      createdFiles: [{ filePath: '/tmp/project/new-file.ts' }],
      evictedFiles: [{ filePath: '/tmp/project/old-file.ts', reason: 'outside rewind window' }],
    })

    const executeRewindPromise = sessionTransport.executeRewind('rewind:execute:1', {
      messageId: 'message-1',
      filesToRestore: [
        {
          filePath: '/tmp/project/src/index.ts',
          contentHash: 'abc123',
          size: 42,
        },
      ],
      filesToDelete: [{ filePath: '/tmp/project/new-file.ts' }],
      forkTitle: 'Rewinded session',
    })

    await waitFor(() => client.executeRewindCalls.length === 1)

    expect(client.executeRewindCalls).toEqual([
      {
        messageId: 'message-1',
        filesToRestore: [
          {
            filePath: '/tmp/project/src/index.ts',
            contentHash: 'abc123',
            size: 42,
          },
        ],
        filesToDelete: [{ filePath: '/tmp/project/new-file.ts' }],
        forkTitle: 'Rewinded session',
      },
    ])

    await expect(executeRewindPromise).resolves.toEqual({
      newSessionId: 'session-1-rewind',
      restoredCount: 1,
      deletedCount: 1,
      failedRestoreCount: 0,
      failedDeleteCount: 0,
    })

    const compactPromise = sessionTransport.compactSession('compact:1', 'Focus on the latest bug')
    await waitFor(() => client.compactSessionCalls.length === 1)

    expect(client.compactSessionCalls).toEqual([{ customInstructions: 'Focus on the latest bug' }])

    await expect(compactPromise).resolves.toEqual({
      newSessionId: 'session-1-compact',
      removedCount: 3,
    })

    const forkPromise = sessionTransport.forkSession('fork:1')
    await waitFor(() => client.forkSessionCalls === 1)

    await expect(forkPromise).resolves.toEqual({
      newSessionId: 'session-1-fork',
    })
    expect(transport.sentMessages).toEqual([])
  })

  it('delegates rename operations to the SDK client', async () => {
    const transport = new FakeDroidClientTransport()
    const client = new FakeDroidClient()
    const sessionTransport = new DroidSdkSessionTransport(
      {
        cwd: '/tmp/session-1',
        droidPath: '/opt/factory/bin/droid',
        sessionId: 'session-1',
      },
      createSessionFactory(transport, client),
    )

    await sessionTransport.renameSession('rename:1', 'Renamed from OXOX')

    expect(client.renameSessionCalls).toEqual([{ title: 'Renamed from OXOX' }])
  })

  it('lists tool, skill, and MCP catalogs through the SDK client', async () => {
    const transport = new FakeDroidClientTransport()
    const client = new FakeDroidClient()
    const sessionTransport = new DroidSdkSessionTransport(
      {
        cwd: '/tmp/session-1',
        droidPath: '/opt/factory/bin/droid',
        sessionId: 'session-1',
      },
      createSessionFactory(transport, client),
    )

    await expect(sessionTransport.listTools('tools:1')).resolves.toEqual([
      {
        id: 'tool-read',
        llmId: 'Read',
        displayName: 'Read',
        description: 'Read a file',
        category: 'read',
        defaultAllowed: true,
        currentlyAllowed: true,
      },
    ])
    await expect(sessionTransport.listSkills('skills:1')).resolves.toEqual([
      {
        name: 'vault-knowledge',
        description: 'Search the project vault',
        location: 'personal',
        filePath: '/Users/test/.factory/skills/vault-knowledge/SKILL.md',
        enabled: true,
        userInvocable: true,
      },
    ])
    await expect(sessionTransport.listMcpServers('mcp:1')).resolves.toEqual([
      {
        name: 'figma',
        status: 'connected',
        source: 'user',
        isManaged: false,
        toolCount: 12,
        serverType: 'http',
        hasAuthTokens: true,
      },
    ])

    expect(client.listToolsCalls).toBe(1)
    expect(client.listSkillsCalls).toBe(1)
    expect(client.listMcpServersCalls).toBe(1)
  })
})
