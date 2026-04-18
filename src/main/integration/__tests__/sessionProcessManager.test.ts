import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'

import {
  DroidClient,
  type DroidClientTransport,
  ProcessExitError,
  type ProcessTransportOptions,
} from '@factory/droid-sdk'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { createDatabaseService } from '../database/service'
import {
  buildDroidSdkProcessTransportOptions,
  type DroidSdkSessionFactory,
} from '../droidSdk/factory'
import { consumeReadable, waitForExit } from '../sessions/processLifecycle'
import { createSessionProcessManager } from '../sessions/processManager'

const encoder = new TextEncoder()

function createSqliteDatabaseFactory() {
  return (databasePath: string) => {
    const sqlite = new DatabaseSync(databasePath)
    let open = true

    return {
      close: () => {
        open = false
        sqlite.close()
      },
      exec: (sql: string) => {
        sqlite.exec(sql)
      },
      get open() {
        return open
      },
      pragma: (statement: string, options?: { simple?: boolean }) => {
        const row = sqlite.prepare(`PRAGMA ${statement}`).get() as
          | Record<string, unknown>
          | undefined

        if (options?.simple) {
          return row ? Object.values(row)[0] : undefined
        }

        return row
      },
      prepare: (sql: string) => {
        const statement = sqlite.prepare(sql)

        return {
          all: (...params: unknown[]) => statement.all(...params),
          get: (...params: unknown[]) => statement.get(...params),
          run: (...params: unknown[]) => statement.run(...params),
        }
      },
      transaction: <T extends (...args: unknown[]) => unknown>(callback: T): T =>
        ((...args: Parameters<T>) => {
          sqlite.exec('BEGIN')

          try {
            const result = callback(...args)
            sqlite.exec('COMMIT')
            return result
          } catch (error) {
            sqlite.exec('ROLLBACK')
            throw error
          }
        }) as T,
    }
  }
}

class FakeChildProcess {
  readonly pid: number
  readonly stdin = {
    write: vi.fn((chunk: string) => {
      this.writes.push(chunk)
      return true
    }),
    end: vi.fn(),
  }
  readonly stdout: ReadableStream<Uint8Array>
  readonly stderr: ReadableStream<Uint8Array>
  readonly writes: string[] = []

  stdoutWriter: WritableStreamDefaultWriter<Uint8Array>
  stderrWriter: WritableStreamDefaultWriter<Uint8Array>
  exitCode: number | null = null
  killed = false

  private resolveExit!: (code: number | null) => void
  readonly exited = new Promise<number | null>((resolve) => {
    this.resolveExit = resolve
  })

  constructor(pid: number) {
    this.pid = pid

    const stdoutStream = new TransformStream<Uint8Array, Uint8Array>()
    const stderrStream = new TransformStream<Uint8Array, Uint8Array>()

    this.stdout = stdoutStream.readable
    this.stderr = stderrStream.readable
    this.stdoutWriter = stdoutStream.writable.getWriter()
    this.stderrWriter = stderrStream.writable.getWriter()
  }

  emitStdout(message: unknown): void {
    void this.stdoutWriter.write(encoder.encode(`${JSON.stringify(message)}\n`))
  }

  emitExit(code: number): void {
    this.exitCode = code
    void this.stdoutWriter.close()
    void this.stderrWriter.close()
    this.resolveExit(code)
  }

  kill(): void {
    this.killed = true
    this.emitExit(this.exitCode ?? 0)
  }
}

class JsonLineBuffer {
  private buffer = ''

  write(chunk: string): string[] {
    this.buffer += chunk

    const lines: string[] = []
    let newlineIndex = this.buffer.indexOf('\n')

    while (newlineIndex >= 0) {
      const line = this.buffer.slice(0, newlineIndex).trim()
      this.buffer = this.buffer.slice(newlineIndex + 1)

      if (line.length > 0) {
        lines.push(line)
      }

      newlineIndex = this.buffer.indexOf('\n')
    }

    return lines
  }

  flush(): string[] {
    const remainder = this.buffer.trim()
    this.buffer = ''
    return remainder.length > 0 ? [remainder] : []
  }
}

class TestDroidClientTransport implements DroidClientTransport {
  readonly childProcess: FakeChildProcess

  isConnected = false

  private readonly lineBuffer = new JsonLineBuffer()
  private messageHandler: ((message: object) => void) | null = null
  private errorHandler: ((error: Error) => void) | null = null
  private closed = false

  constructor(
    options: ProcessTransportOptions = {},
    spawnProcess: (request: {
      command: string
      args: string[]
      cwd?: string
      env?: NodeJS.ProcessEnv
    }) => FakeChildProcess,
  ) {
    this.childProcess = spawnProcess({
      command: options.execPath ?? 'droid',
      args: options.execArgs ? [...options.execArgs] : [],
      cwd: options.cwd,
      env: options.env,
    })
  }

  async connect(): Promise<void> {
    this.isConnected = true

    consumeReadable(this.childProcess.stdout, (text) => {
      for (const line of this.lineBuffer.write(text)) {
        this.messageHandler?.(JSON.parse(line) as object)
      }
    }).catch((error) => {
      this.errorHandler?.(error instanceof Error ? error : new Error(String(error)))
    })

    waitForExit(this.childProcess).then((code) => {
      for (const line of this.lineBuffer.flush()) {
        this.messageHandler?.(JSON.parse(line) as object)
      }

      this.isConnected = false

      if (this.closed) {
        return
      }

      this.errorHandler?.(
        new ProcessExitError(`Droid process exited unexpectedly (exit code ${code ?? 'unknown'})`, {
          exitCode: code,
        }),
      )
    })
  }

  send(message: object): void {
    this.childProcess.stdin.write(`${JSON.stringify(message)}\n`)
  }

  onMessage(callback: (message: object) => void): void {
    this.messageHandler = callback
  }

  onError(callback: (error: Error) => void): void {
    this.errorHandler = callback
  }

  async close(): Promise<void> {
    if (this.closed) {
      return
    }

    this.closed = true
    this.isConnected = false
    this.childProcess.kill()
  }
}

function createTestDroidSdkSessionFactory(
  spawnProcess: (request: {
    command: string
    args: string[]
    cwd?: string
    env?: NodeJS.ProcessEnv
  }) => FakeChildProcess,
): DroidSdkSessionFactory {
  return {
    createTransport: (config) =>
      new TestDroidClientTransport(buildDroidSdkProcessTransportOptions(config), spawnProcess),
    createClient: (transport) => new DroidClient({ transport }),
  }
}

function getRequestId(process: FakeChildProcess, index = 0): string {
  return String((JSON.parse(process.writes[index] ?? '{}') as { id?: string }).id ?? '')
}

function waitFor(
  predicate: () => boolean,
  timeoutMs = 2_000,
  description = 'condition',
): Promise<void> {
  const deadline = Date.now() + timeoutMs

  return new Promise((resolve, reject) => {
    const tick = () => {
      if (predicate()) {
        resolve()
        return
      }

      if (Date.now() >= deadline) {
        reject(new Error(`timed out after ${timeoutMs}ms waiting for ${description}`))
        return
      }

      setTimeout(tick, 10)
    }

    tick()
  })
}

function createResponse(id: string, result: unknown) {
  return {
    jsonrpc: '2.0',
    factoryApiVersion: '1.0.0',
    type: 'response',
    id,
    result,
  }
}

function createNotification(notification: unknown) {
  return {
    jsonrpc: '2.0',
    factoryApiVersion: '1.0.0',
    type: 'notification',
    method: 'droid.session_notification',
    params: {
      notification,
    },
  }
}

function createCallback(id: string, method: string, params: unknown) {
  return {
    jsonrpc: '2.0',
    factoryApiVersion: '1.0.0',
    type: 'request',
    id,
    method,
    params,
  }
}

function createAvailableModels() {
  return [
    {
      id: 'gpt-5.4',
      displayName: 'GPT 5.4',
      shortDisplayName: 'GPT 5.4',
      modelProvider: 'openai',
      supportedReasoningEfforts: ['medium', 'high'],
      defaultReasoningEffort: 'medium',
    },
    {
      id: 'gpt-5.4-mini',
      displayName: 'GPT 5.4 Mini',
      shortDisplayName: 'GPT 5.4 Mini',
      modelProvider: 'openai',
      supportedReasoningEfforts: ['low', 'medium'],
      defaultReasoningEffort: 'low',
    },
  ]
}

describe('createSessionProcessManager', () => {
  const cleanup: Array<() => void | Promise<void>> = []

  afterEach(async () => {
    while (cleanup.length > 0) {
      await cleanup.pop()?.()
    }
  })

  it('attaches to a running session without respawning and replays buffered history after detach', async () => {
    const userDataPath = mkdtempSync(join(tmpdir(), 'oxox-session-process-'))
    const database = createDatabaseService({
      userDataPath,
      databaseFactory: createSqliteDatabaseFactory(),
    })
    cleanup.push(() => database.close())

    const process = new FakeChildProcess(4_321)
    const spawnProcess = vi.fn(() => process)
    const manager = createSessionProcessManager({
      database,
      droidPath: '/opt/factory/bin/droid',
      droidSdkSessionFactory: createTestDroidSdkSessionFactory(spawnProcess),
      reconnectDelayMs: 0,
      spawnProcess,
    })
    cleanup.push(() => manager.dispose())

    const createdPromise = manager.createSession({
      cwd: '/tmp/oxox-live-session',
      viewerId: 'window-a',
    })

    await waitFor(() => process.writes.length === 1)
    process.emitStdout(
      createResponse(getRequestId(process), {
        sessionId: 'session-live-1',
        session: { messages: [] },
        settings: {
          modelId: 'gpt-5.4',
          reasoningEffort: 'medium',
        },
      }),
    )

    const created = await createdPromise
    expect(created.sessionId).toBe('session-live-1')
    expect(spawnProcess).toHaveBeenCalledTimes(1)

    const liveEvents: Array<{ type: string }> = []
    const unsubscribe = manager.subscribe('session-live-1', (event) => {
      liveEvents.push(event as { type: string })
    })
    cleanup.push(() => unsubscribe())

    await manager.detachSession('session-live-1', 'window-a')
    process.emitStdout(
      createNotification({
        type: 'assistant_text_delta',
        messageId: 'message-1',
        blockIndex: 0,
        textDelta: 'Hello from detach',
      }),
    )
    process.emitStdout(
      createNotification({
        type: 'create_message',
        message: {
          id: 'message-1',
          role: 'assistant',
          createdAt: 1,
          updatedAt: 1,
          content: [{ type: 'text', text: 'Hello from detach' }],
        },
      }),
    )

    await waitFor(() => liveEvents.length >= 2)

    const attached = await manager.attachSession('session-live-1', {
      viewerId: 'window-b',
    })

    expect(spawnProcess).toHaveBeenCalledTimes(1)
    expect(attached.messages).toEqual([
      {
        id: 'message-1',
        role: 'assistant',
        content: 'Hello from detach',
        contentBlocks: [{ type: 'text', text: 'Hello from detach' }],
      },
    ])
    expect(attached.events.map((event) => event.type)).toEqual([
      'message.delta',
      'message.completed',
    ])
    expect(database.listSessions()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'session-live-1',
          status: 'active',
          transport: 'stream-jsonrpc',
        }),
      ]),
    )
  })

  it('filters structured tool payloads out of attached session message history', async () => {
    const userDataPath = mkdtempSync(join(tmpdir(), 'oxox-session-process-'))
    const database = createDatabaseService({
      userDataPath,
      databaseFactory: createSqliteDatabaseFactory(),
    })
    cleanup.push(() => database.close())

    const process = new FakeChildProcess(4_654)
    const spawnProcess = vi.fn(() => process)
    const manager = createSessionProcessManager({
      database,
      droidPath: '/opt/factory/bin/droid',
      droidSdkSessionFactory: createTestDroidSdkSessionFactory(spawnProcess),
      spawnProcess,
    })
    cleanup.push(() => manager.dispose())

    const attachPromise = manager.attachSession('session-history-1', {
      viewerId: 'window-a',
    })

    await waitFor(() => process.writes.length === 1)
    process.emitStdout(
      createResponse(getRequestId(process), {
        session: {
          messages: [
            {
              id: 'message-user-1',
              role: 'user',
              content: [{ type: 'text', text: 'Why is attach rendering bloated?' }],
            },
            {
              id: 'message-assistant-1',
              role: 'assistant',
              content: [
                { type: 'text', text: 'I investigated the issue.' },
                {
                  type: 'tool_use',
                  id: 'tool-1',
                  name: 'Read',
                  input: { file_path: '/tmp/transcript.tsx' },
                },
              ],
            },
            {
              id: 'message-tool-1',
              role: 'tool',
              content: [
                {
                  type: 'tool_result',
                  toolUseId: 'tool-1',
                  content:
                    'serialized payload dump that should render as a tool row instead of bloating the message body',
                },
              ],
            },
          ],
        },
        settings: { modelId: 'gpt-5.4', reasoningEffort: 'medium' },
        cwd: '/tmp/history-session',
        isAgentLoopInProgress: false,
      }),
    )

    const attached = await attachPromise

    expect(attached.messages).toEqual([
      {
        id: 'message-user-1',
        role: 'user',
        content: 'Why is attach rendering bloated?',
        contentBlocks: [{ type: 'text', text: 'Why is attach rendering bloated?' }],
      },
      {
        id: 'message-assistant-1',
        role: 'assistant',
        content: 'I investigated the issue.',
        contentBlocks: [{ type: 'text', text: 'I investigated the issue.' }],
      },
    ])
  })

  it('prefers explicit SDK session titles over inferring from the first loaded message', async () => {
    const userDataPath = mkdtempSync(join(tmpdir(), 'oxox-session-process-'))
    const database = createDatabaseService({
      userDataPath,
      databaseFactory: createSqliteDatabaseFactory(),
    })
    cleanup.push(() => database.close())

    const process = new FakeChildProcess(4_654)
    const spawnProcess = vi.fn(() => process)
    const manager = createSessionProcessManager({
      database,
      droidPath: '/opt/factory/bin/droid',
      droidSdkSessionFactory: createTestDroidSdkSessionFactory(spawnProcess),
      spawnProcess,
    })
    cleanup.push(() => manager.dispose())

    const attachPromise = manager.attachSession('session-title-1', {
      viewerId: 'window-a',
    })

    await waitFor(() => process.writes.length === 1)
    process.emitStdout(
      createResponse(getRequestId(process), {
        session: {
          title: 'Can you find the latest changes on the apartment project?',
          sessionTitle: 'Find Latest Apartment Project Changes',
          messages: [
            {
              id: 'message-user-1',
              role: 'user',
              content: [
                {
                  type: 'text',
                  text: '<system-reminder>very long prepended context</system-reminder> Can you find the latest changes on the apartment project?',
                },
              ],
            },
          ],
        },
        settings: { modelId: 'gpt-5.4', reasoningEffort: 'medium' },
        cwd: '/tmp/history-session',
        isAgentLoopInProgress: false,
      }),
    )

    const attached = await attachPromise

    expect(attached.title).toBe('Find Latest Apartment Project Changes')
    expect(database.getSession('session-title-1')).toMatchObject({
      title: 'Find Latest Apartment Project Changes',
    })
  })

  it('hydrates attached session tool history with names so later live rows do not degrade to Unknown tool', async () => {
    const userDataPath = mkdtempSync(join(tmpdir(), 'oxox-session-process-'))
    const database = createDatabaseService({
      userDataPath,
      databaseFactory: createSqliteDatabaseFactory(),
    })
    cleanup.push(() => database.close())

    const process = new FakeChildProcess(4_655)
    const spawnProcess = vi.fn(() => process)
    const manager = createSessionProcessManager({
      database,
      droidPath: '/opt/factory/bin/droid',
      droidSdkSessionFactory: createTestDroidSdkSessionFactory(spawnProcess),
      spawnProcess,
    })
    cleanup.push(() => manager.dispose())

    const attachPromise = manager.attachSession('session-history-2', {
      viewerId: 'window-a',
    })

    await waitFor(() => process.writes.length === 1)
    process.emitStdout(
      createResponse(getRequestId(process), {
        session: {
          messages: [
            {
              id: 'message-assistant-1',
              role: 'assistant',
              content: [
                {
                  type: 'tool_use',
                  id: 'tool-1',
                  name: 'Read',
                  input: { file_path: '/tmp/transcript.tsx' },
                },
              ],
            },
            {
              id: 'message-user-1',
              role: 'user',
              content: [
                {
                  type: 'tool_result',
                  tool_use_id: 'tool-1',
                  content: 'loaded transcript file',
                },
              ],
            },
          ],
        },
        settings: { modelId: 'gpt-5.4', reasoningEffort: 'medium' },
        cwd: '/tmp/history-session',
        isAgentLoopInProgress: false,
      }),
    )

    const attached = await attachPromise

    expect(attached.events).toEqual([
      {
        type: 'tool.progress',
        toolUseId: 'tool-1',
        toolName: 'Read',
        status: 'running',
        detail: '```json\n{\n  "file_path": "/tmp/transcript.tsx"\n}\n```',
      },
      {
        type: 'tool.result',
        toolUseId: 'tool-1',
        toolName: 'Read',
        content: 'loaded transcript file',
        isError: false,
      },
    ])
  })

  it('hydrates attached session history in transcript order so tool rows stay anchored between message segments', async () => {
    const userDataPath = mkdtempSync(join(tmpdir(), 'oxox-session-process-'))
    const database = createDatabaseService({
      userDataPath,
      databaseFactory: createSqliteDatabaseFactory(),
    })
    cleanup.push(() => database.close())

    const process = new FakeChildProcess(4_656)
    const spawnProcess = vi.fn(() => process)
    const manager = createSessionProcessManager({
      database,
      droidPath: '/opt/factory/bin/droid',
      droidSdkSessionFactory: createTestDroidSdkSessionFactory(spawnProcess),
      spawnProcess,
    })
    cleanup.push(() => manager.dispose())

    const attachPromise = manager.attachSession('session-history-3', {
      viewerId: 'window-a',
    })

    await waitFor(() => process.writes.length === 1)
    process.emitStdout(
      createResponse(getRequestId(process), {
        session: {
          messages: [
            {
              id: 'message-user-1',
              role: 'user',
              content: [{ type: 'text', text: 'Please inspect the transcript renderer.' }],
            },
            {
              id: 'message-assistant-1',
              role: 'assistant',
              content: [
                { type: 'text', text: 'Before tool.' },
                {
                  type: 'tool_use',
                  id: 'tool-1',
                  name: 'Read',
                  input: { file_path: '/tmp/transcript.tsx' },
                },
                { type: 'text', text: 'After tool.' },
              ],
            },
            {
              id: 'message-user-2',
              role: 'user',
              content: [
                {
                  type: 'tool_result',
                  tool_use_id: 'tool-1',
                  content: 'loaded transcript file',
                },
              ],
            },
          ],
        },
        settings: { modelId: 'gpt-5.4', reasoningEffort: 'medium' },
        cwd: '/tmp/history-session',
        isAgentLoopInProgress: false,
      }),
    )

    const attached = await attachPromise

    expect(attached.events).toEqual([
      {
        type: 'message.completed',
        messageId: 'message-user-1',
        role: 'user',
        content: 'Please inspect the transcript renderer.',
        contentBlocks: [{ type: 'text', text: 'Please inspect the transcript renderer.' }],
      },
      {
        type: 'message.completed',
        messageId: 'message-assistant-1',
        role: 'assistant',
        content: 'Before tool.',
        contentBlocks: [{ type: 'text', text: 'Before tool.' }],
      },
      {
        type: 'tool.progress',
        toolUseId: 'tool-1',
        toolName: 'Read',
        status: 'running',
        detail: '```json\n{\n  "file_path": "/tmp/transcript.tsx"\n}\n```',
      },
      {
        type: 'message.completed',
        messageId: 'message-assistant-1',
        role: 'assistant',
        content: 'After tool.',
        contentBlocks: [{ type: 'text', text: 'After tool.' }],
      },
      {
        type: 'tool.result',
        toolUseId: 'tool-1',
        toolName: 'Read',
        content: 'loaded transcript file',
        isError: false,
      },
    ])
  })

  it('preserves partial streaming output and marks the session reconnecting before issuing auto-reattach', async () => {
    const userDataPath = mkdtempSync(join(tmpdir(), 'oxox-session-process-'))
    const database = createDatabaseService({
      userDataPath,
      databaseFactory: createSqliteDatabaseFactory(),
    })
    cleanup.push(() => database.close())

    const firstProcess = new FakeChildProcess(6_101)
    const reattachProcess = new FakeChildProcess(6_102)
    const processes = [firstProcess, reattachProcess]
    const spawnProcess = vi.fn(() => {
      const next = processes.shift()

      if (!next) {
        throw new Error('missing fake process')
      }

      return next
    })

    const manager = createSessionProcessManager({
      database,
      droidPath: '/opt/factory/bin/droid',
      droidSdkSessionFactory: createTestDroidSdkSessionFactory(spawnProcess),
      spawnProcess,
    })
    cleanup.push(() => manager.dispose())

    const createdPromise = manager.createSession({
      cwd: '/tmp/reconnect-session',
      viewerId: 'window-a',
    })

    await waitFor(() => firstProcess.writes.length === 1, 2_000, 'initial session create request')
    firstProcess.emitStdout(
      createResponse(getRequestId(firstProcess), {
        sessionId: 'session-reconnect-1',
        session: { messages: [] },
        settings: { modelId: 'gpt-5.4', reasoningEffort: 'medium' },
      }),
    )

    await createdPromise

    firstProcess.emitStdout(
      createNotification({
        type: 'assistant_text_delta',
        messageId: 'message-1',
        blockIndex: 0,
        textDelta: 'Partial repl',
      }),
    )

    await waitFor(
      () => manager.getSessionSnapshot('session-reconnect-1')?.events.length === 1,
      2_000,
      'initial streamed partial output',
    )

    firstProcess.emitExit(17)

    await waitFor(() => spawnProcess.mock.calls.length === 2, 2_000, 'reattach process spawn')
    await waitFor(
      () => manager.getSessionSnapshot('session-reconnect-1')?.status === 'reconnecting',
      2_000,
      'reconnecting status',
    )

    expect(manager.getSessionSnapshot('session-reconnect-1')).toMatchObject({
      sessionId: 'session-reconnect-1',
      status: 'reconnecting',
    })
    expect(manager.getSessionSnapshot('session-reconnect-1')?.events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: 'message.delta',
          messageId: 'message-1',
          delta: 'Partial repl',
        }),
        expect.objectContaining({
          type: 'stream.error',
          recoverable: true,
        }),
      ]),
    )
    expect(database.getSession('session-reconnect-1')).toMatchObject({
      id: 'session-reconnect-1',
      status: 'reconnecting',
    })

    await waitFor(() => reattachProcess.writes.length === 1, 2_000, 'reattach load request')
    expect(JSON.parse(reattachProcess.writes[0] ?? '{}')).toMatchObject({
      method: 'droid.load_session',
      params: {
        sessionId: 'session-reconnect-1',
      },
    })
    reattachProcess.emitStdout(
      createResponse(getRequestId(reattachProcess), {
        sessionId: 'session-reconnect-1',
        session: {
          messages: [
            {
              id: 'message-user-1',
              role: 'user',
              content: [{ type: 'text', text: 'Keep going' }],
            },
          ],
        },
        settings: { modelId: 'gpt-5.4', interactionMode: 'auto' },
        cwd: '/tmp/reconnect-session',
        isAgentLoopInProgress: true,
      }),
    )
  })

  it('reconciles stale runtime rows into orphaned sessions when a droid exec process survives a force-quit', () => {
    const userDataPath = mkdtempSync(join(tmpdir(), 'oxox-session-process-'))
    const database = createDatabaseService({
      userDataPath,
      databaseFactory: createSqliteDatabaseFactory(),
    })
    cleanup.push(() => database.close())

    database.upsertSession({
      sessionId: 'session-orphan-1',
      projectWorkspacePath: '/tmp/orphaned-session',
      title: 'Orphaned session',
      status: 'active',
      transport: 'stream-jsonrpc',
      createdAt: '2026-03-25T00:00:00.000Z',
      lastActivityAt: '2026-03-25T00:01:00.000Z',
      updatedAt: '2026-03-25T00:01:00.000Z',
    })
    database.upsertSessionRuntime({
      sessionId: 'session-orphan-1',
      transport: 'stream-jsonrpc',
      status: 'active',
      processId: 9_001,
      viewerCount: 1,
      lastEventAt: '2026-03-25T00:01:00.000Z',
      updatedAt: '2026-03-25T00:01:00.000Z',
    })

    const manager = createSessionProcessManager({
      database,
      droidPath: '/opt/factory/bin/droid',
      isProcessAlive: (processId: number) => processId === 9_001,
      isDroidProcess: (processId: number) => processId === 9_001,
    } as never)
    cleanup.push(() => manager.dispose())

    expect(database.listSessions()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'session-orphan-1',
          status: 'orphaned',
          transport: 'stream-jsonrpc',
        }),
      ]),
    )
  })

  it('interrupts, forks, and tracks multiple live sessions independently', async () => {
    const userDataPath = mkdtempSync(join(tmpdir(), 'oxox-session-process-'))
    const database = createDatabaseService({
      userDataPath,
      databaseFactory: createSqliteDatabaseFactory(),
    })
    cleanup.push(() => database.close())

    const firstProcess = new FakeChildProcess(5_001)
    const secondProcess = new FakeChildProcess(5_002)
    const thirdProcess = new FakeChildProcess(5_003)
    const forkProcess = new FakeChildProcess(5_004)
    const processes = [firstProcess, secondProcess, thirdProcess, forkProcess]
    const spawnProcess = vi.fn(() => {
      const next = processes.shift()

      if (!next) {
        throw new Error('missing fake process')
      }

      return next
    })

    const manager = createSessionProcessManager({
      database,
      droidPath: '/opt/factory/bin/droid',
      droidSdkSessionFactory: createTestDroidSdkSessionFactory(spawnProcess),
      spawnProcess,
    })
    cleanup.push(() => manager.dispose())

    const firstCreate = manager.createSession({ cwd: '/tmp/one', viewerId: 'window-1' })
    await waitFor(() => firstProcess.writes.length === 1)
    firstProcess.emitStdout(
      createResponse(getRequestId(firstProcess), {
        sessionId: 'session-one',
        session: { messages: [] },
        settings: { modelId: 'gpt-5.4', reasoningEffort: 'medium' },
      }),
    )
    await firstCreate

    const secondCreate = manager.createSession({ cwd: '/tmp/two', viewerId: 'window-2' })
    await waitFor(() => secondProcess.writes.length === 1)
    secondProcess.emitStdout(
      createResponse(getRequestId(secondProcess), {
        sessionId: 'session-two',
        session: { messages: [] },
        settings: { modelId: 'gpt-5.4', reasoningEffort: 'medium' },
      }),
    )
    await secondCreate

    const thirdCreate = manager.createSession({ cwd: '/tmp/three', viewerId: 'window-3' })
    await waitFor(() => thirdProcess.writes.length === 1)
    thirdProcess.emitStdout(
      createResponse(getRequestId(thirdProcess), {
        sessionId: 'session-three',
        session: { messages: [] },
        settings: { modelId: 'gpt-5.4', reasoningEffort: 'medium' },
      }),
    )
    await thirdCreate

    const interruptPromise = manager.interruptSession('session-one')
    await waitFor(() => firstProcess.writes.length >= 2)
    const interruptRequest = JSON.parse(firstProcess.writes.at(-1) ?? '{}')
    firstProcess.emitStdout(createResponse(interruptRequest.id, {}))
    await interruptPromise

    firstProcess.emitStdout(
      createNotification({
        type: 'droid_working_state_changed',
        newState: 'idle',
      }),
    )

    const forkPromise = manager.forkSession('session-one', { viewerId: 'window-fork' })
    await waitFor(() => firstProcess.writes.length >= 3)
    const forkRequest = JSON.parse(firstProcess.writes.at(-1) ?? '{}') as {
      id?: string
      method?: string
      params?: Record<string, unknown>
    }

    expect(forkRequest.method).toBe('droid.fork_session')
    expect(forkRequest.params).toEqual({})

    firstProcess.emitStdout(
      createResponse(forkRequest.id ?? 'session:fork:1', {
        newSessionId: 'session-one-fork',
      }),
    )

    await waitFor(() => forkProcess.writes.length === 1)
    forkProcess.emitStdout(
      createResponse(getRequestId(forkProcess), {
        session: { messages: [] },
        settings: { modelId: 'gpt-5.4', reasoningEffort: 'medium' },
        cwd: '/tmp/one',
      }),
    )

    const forked = await forkPromise

    expect(forked.parentSessionId).toBe('session-one')
    expect(forked.processId).toBe(5_004)
    expect(spawnProcess).toHaveBeenCalledTimes(4)

    const sessions = database.listSessions()
    expect(sessions.map((session) => session.id).sort()).toEqual([
      'session-one',
      'session-one-fork',
      'session-three',
      'session-two',
    ])
    expect(sessions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 'session-one', status: 'idle' }),
        expect.objectContaining({ id: 'session-two', status: 'active' }),
        expect.objectContaining({ id: 'session-three', status: 'active' }),
        expect.objectContaining({ id: 'session-one-fork', status: 'idle' }),
      ]),
    )
  }, 10000)

  it('loads detached sessions on demand for rewind info and rewind execution', async () => {
    const userDataPath = mkdtempSync(join(tmpdir(), 'oxox-session-process-'))
    const database = createDatabaseService({
      userDataPath,
      databaseFactory: createSqliteDatabaseFactory(),
    })
    cleanup.push(() => database.close())

    database.upsertSession({
      sessionId: 'session-rewind-source',
      projectWorkspacePath: '/tmp/rewind-source',
      modelId: 'gpt-5.4',
      hasUserMessage: true,
      title: 'Source session',
      status: 'completed',
      transport: 'artifacts',
      createdAt: '2026-04-08T20:00:00.000Z',
      lastActivityAt: '2026-04-08T20:10:00.000Z',
      updatedAt: '2026-04-08T20:10:00.000Z',
    })

    const sourceProcess = new FakeChildProcess(7_001)
    const rewindProcess = new FakeChildProcess(7_002)
    const spawnProcess = vi
      .fn()
      .mockReturnValueOnce(sourceProcess)
      .mockReturnValueOnce(rewindProcess)
    const manager = createSessionProcessManager({
      database,
      droidPath: '/opt/factory/bin/droid',
      droidSdkSessionFactory: createTestDroidSdkSessionFactory(spawnProcess),
      spawnProcess,
    })
    cleanup.push(() => manager.dispose())

    const rewindInfoPromise = manager.getRewindInfo('session-rewind-source', 'message-1')
    await waitFor(() => sourceProcess.writes.length === 1)
    sourceProcess.emitStdout(
      createResponse(getRequestId(sourceProcess), {
        session: {
          messages: [
            {
              id: 'message-1',
              role: 'user',
              content: [{ type: 'text', text: 'Take me back' }],
            },
          ],
        },
        settings: { modelId: 'gpt-5.4', reasoningEffort: 'medium' },
        cwd: '/tmp/rewind-source',
        isAgentLoopInProgress: false,
      }),
    )

    await waitFor(() => sourceProcess.writes.length === 2)
    const rewindInfoRequest = JSON.parse(sourceProcess.writes[1] ?? '{}') as {
      method?: string
      params?: Record<string, unknown>
    }
    expect(rewindInfoRequest.method).toBe('droid.get_rewind_info')
    expect(rewindInfoRequest.params).toEqual({
      messageId: 'message-1',
    })
    sourceProcess.emitStdout(
      createResponse(getRequestId(sourceProcess, 1), {
        availableFiles: [
          {
            filePath: '/tmp/rewind-source/src/index.ts',
            contentHash: 'hash-1',
            size: 12,
          },
        ],
        createdFiles: [{ filePath: '/tmp/rewind-source/src/new.ts' }],
        evictedFiles: [],
      }),
    )

    await expect(rewindInfoPromise).resolves.toEqual({
      availableFiles: [
        {
          filePath: '/tmp/rewind-source/src/index.ts',
          contentHash: 'hash-1',
          size: 12,
        },
      ],
      createdFiles: [{ filePath: '/tmp/rewind-source/src/new.ts' }],
      evictedFiles: [],
    })

    const executeRewindPromise = manager.executeRewind('session-rewind-source', {
      messageId: 'message-1',
      filesToRestore: [
        {
          filePath: '/tmp/rewind-source/src/index.ts',
          contentHash: 'hash-1',
          size: 12,
        },
      ],
      filesToDelete: [{ filePath: '/tmp/rewind-source/src/new.ts' }],
      forkTitle: 'Rewinded session',
      viewerId: 'window-1',
    })

    await waitFor(() => sourceProcess.writes.length === 3)
    const executeRewindRequest = JSON.parse(sourceProcess.writes[2] ?? '{}') as {
      method?: string
      params?: Record<string, unknown>
      id?: string
    }
    expect(executeRewindRequest.method).toBe('droid.execute_rewind')
    expect(executeRewindRequest.params).toEqual({
      messageId: 'message-1',
      filesToRestore: [
        {
          filePath: '/tmp/rewind-source/src/index.ts',
          contentHash: 'hash-1',
          size: 12,
        },
      ],
      filesToDelete: [{ filePath: '/tmp/rewind-source/src/new.ts' }],
      forkTitle: 'Rewinded session',
    })
    sourceProcess.emitStdout(
      createResponse(executeRewindRequest.id ?? 'session:rewind:execute:1', {
        newSessionId: 'session-rewind-fork',
        restoredCount: 1,
        deletedCount: 1,
        failedRestoreCount: 0,
        failedDeleteCount: 0,
      }),
    )

    await waitFor(() => rewindProcess.writes.length === 1)
    rewindProcess.emitStdout(
      createResponse(getRequestId(rewindProcess), {
        session: {
          messages: [
            {
              id: 'message-1',
              role: 'user',
              content: [{ type: 'text', text: 'Take me back' }],
            },
          ],
        },
        settings: { modelId: 'gpt-5.4', reasoningEffort: 'medium' },
        cwd: '/tmp/rewind-source',
        isAgentLoopInProgress: false,
      }),
    )

    await expect(executeRewindPromise).resolves.toMatchObject({
      snapshot: expect.objectContaining({
        sessionId: 'session-rewind-fork',
        parentSessionId: 'session-rewind-source',
        status: 'idle',
      }),
      restoredCount: 1,
      deletedCount: 1,
      failedRestoreCount: 0,
      failedDeleteCount: 0,
    })
  })

  it('loads detached sessions on demand for primary fork', async () => {
    const userDataPath = mkdtempSync(join(tmpdir(), 'oxox-session-process-'))
    const database = createDatabaseService({
      userDataPath,
      databaseFactory: createSqliteDatabaseFactory(),
    })
    cleanup.push(() => database.close())

    database.upsertSession({
      sessionId: 'session-fork-source',
      projectWorkspacePath: '/tmp/fork-source',
      modelId: 'gpt-5.4',
      hasUserMessage: true,
      title: 'Fork source',
      status: 'completed',
      transport: 'artifacts',
      createdAt: '2026-04-08T20:00:00.000Z',
      lastActivityAt: '2026-04-08T20:10:00.000Z',
      updatedAt: '2026-04-08T20:10:00.000Z',
    })

    const sourceProcess = new FakeChildProcess(7_101)
    const forkProcess = new FakeChildProcess(7_102)
    const spawnProcess = vi.fn().mockReturnValueOnce(sourceProcess).mockReturnValueOnce(forkProcess)
    const manager = createSessionProcessManager({
      database,
      droidPath: '/opt/factory/bin/droid',
      droidSdkSessionFactory: createTestDroidSdkSessionFactory(spawnProcess),
      spawnProcess,
    })
    cleanup.push(() => manager.dispose())

    const forkPromise = manager.forkSession('session-fork-source', {
      viewerId: 'window-1',
    })

    await waitFor(() => sourceProcess.writes.length === 1)
    sourceProcess.emitStdout(
      createResponse(getRequestId(sourceProcess), {
        session: {
          messages: [
            {
              id: 'message-1',
              role: 'user',
              content: [{ type: 'text', text: 'Fork me' }],
            },
          ],
        },
        settings: { modelId: 'gpt-5.4', reasoningEffort: 'medium' },
        cwd: '/tmp/fork-source',
        isAgentLoopInProgress: false,
      }),
    )

    await waitFor(() => sourceProcess.writes.length === 2)
    const forkRequest = JSON.parse(sourceProcess.writes[1] ?? '{}') as {
      method?: string
      params?: Record<string, unknown>
      id?: string
    }
    expect(forkRequest.method).toBe('droid.fork_session')
    expect(forkRequest.params).toEqual({})
    sourceProcess.emitStdout(
      createResponse(forkRequest.id ?? 'session:fork:1', {
        newSessionId: 'session-fork-derived',
      }),
    )

    await waitFor(() => forkProcess.writes.length === 1)
    forkProcess.emitStdout(
      createResponse(getRequestId(forkProcess), {
        session: {
          messages: [
            {
              id: 'message-1',
              role: 'user',
              content: [{ type: 'text', text: 'Fork me' }],
            },
          ],
        },
        settings: { modelId: 'gpt-5.4', reasoningEffort: 'medium' },
        cwd: '/tmp/fork-source',
        isAgentLoopInProgress: false,
      }),
    )

    await expect(forkPromise).resolves.toMatchObject({
      sessionId: 'session-fork-derived',
      parentSessionId: 'session-fork-source',
      status: 'idle',
    })
  })

  it('loads detached sessions on demand for compact', async () => {
    const userDataPath = mkdtempSync(join(tmpdir(), 'oxox-session-process-'))
    const database = createDatabaseService({
      userDataPath,
      databaseFactory: createSqliteDatabaseFactory(),
    })
    cleanup.push(() => database.close())

    database.upsertSession({
      sessionId: 'session-compact-source',
      projectWorkspacePath: '/tmp/compact-source',
      modelId: 'gpt-5.4',
      hasUserMessage: true,
      title: 'Compact source',
      status: 'completed',
      transport: 'artifacts',
      createdAt: '2026-04-08T20:00:00.000Z',
      lastActivityAt: '2026-04-08T20:10:00.000Z',
      updatedAt: '2026-04-08T20:10:00.000Z',
    })

    const sourceProcess = new FakeChildProcess(7_201)
    const compactProcess = new FakeChildProcess(7_202)
    const spawnProcess = vi
      .fn()
      .mockReturnValueOnce(sourceProcess)
      .mockReturnValueOnce(compactProcess)
    const manager = createSessionProcessManager({
      database,
      droidPath: '/opt/factory/bin/droid',
      droidSdkSessionFactory: createTestDroidSdkSessionFactory(spawnProcess),
      spawnProcess,
    })
    cleanup.push(() => manager.dispose())

    const compactPromise = manager.compactSession('session-compact-source', {
      viewerId: 'window-1',
    })

    await waitFor(() => sourceProcess.writes.length === 1)
    sourceProcess.emitStdout(
      createResponse(getRequestId(sourceProcess), {
        session: {
          messages: [
            {
              id: 'message-1',
              role: 'user',
              content: [{ type: 'text', text: 'Compact me' }],
            },
          ],
        },
        settings: { modelId: 'gpt-5.4', reasoningEffort: 'medium' },
        cwd: '/tmp/compact-source',
        isAgentLoopInProgress: false,
      }),
    )

    await waitFor(() => sourceProcess.writes.length === 2)
    const compactRequest = JSON.parse(sourceProcess.writes[1] ?? '{}') as {
      method?: string
      params?: Record<string, unknown>
      id?: string
    }
    expect(compactRequest.method).toBe('droid.compact_session')
    expect(compactRequest.params).toEqual({})
    sourceProcess.emitStdout(
      createResponse(compactRequest.id ?? 'session:compact:1', {
        newSessionId: 'session-compact-derived',
        removedCount: 4,
      }),
    )

    await waitFor(() => compactProcess.writes.length === 1)
    compactProcess.emitStdout(
      createResponse(getRequestId(compactProcess), {
        session: {
          messages: [
            {
              id: 'message-1',
              role: 'assistant',
              content: [{ type: 'text', text: 'Compacted summary' }],
            },
          ],
        },
        settings: { modelId: 'gpt-5.4', reasoningEffort: 'medium' },
        cwd: '/tmp/compact-source',
        isAgentLoopInProgress: false,
      }),
    )

    await expect(compactPromise).resolves.toMatchObject({
      snapshot: expect.objectContaining({
        sessionId: 'session-compact-derived',
        parentSessionId: 'session-compact-source',
        status: 'idle',
      }),
      removedCount: 4,
    })
    expect(database.getSession('session-compact-derived')).toMatchObject({
      id: 'session-compact-derived',
      parentSessionId: 'session-compact-source',
      derivationType: 'compact',
      hasUserMessage: false,
    })
  })

  it('sends the initial prompt to the live session and persists resulting messages', async () => {
    const userDataPath = mkdtempSync(join(tmpdir(), 'oxox-session-process-'))
    const database = createDatabaseService({
      userDataPath,
      databaseFactory: createSqliteDatabaseFactory(),
    })
    cleanup.push(() => database.close())

    const process = new FakeChildProcess(6_001)
    const spawnProcess = vi.fn(() => process)
    const manager = createSessionProcessManager({
      database,
      droidPath: '/opt/factory/bin/droid',
      droidSdkSessionFactory: createTestDroidSdkSessionFactory(spawnProcess),
      spawnProcess,
    })
    cleanup.push(() => manager.dispose())

    const createdPromise = manager.createSession({
      cwd: '/tmp/live-session',
      viewerId: 'window-a',
    })

    await waitFor(() => process.writes.length === 1)
    process.emitStdout(
      createResponse(getRequestId(process), {
        sessionId: 'session-live-2',
        session: { messages: [] },
        settings: { modelId: 'gpt-5.4', reasoningEffort: 'medium' },
      }),
    )

    await createdPromise

    const sendPromptPromise = manager.addUserMessage('session-live-2', 'Plan the launch checklist')

    await waitFor(() => process.writes.length === 2)
    const addMessageRequest = JSON.parse(process.writes[1] ?? '{}') as {
      method?: string
      params?: { text?: string }
      id?: string
    }

    expect(addMessageRequest.method).toBe('droid.add_user_message')
    expect(addMessageRequest.params?.text).toBe('Plan the launch checklist')

    process.emitStdout(createResponse(addMessageRequest.id ?? 'session:message:1', {}))
    process.emitStdout(
      createNotification({
        type: 'create_message',
        message: {
          id: 'message-user-1',
          role: 'user',
          createdAt: 1,
          updatedAt: 1,
          content: [{ type: 'text', text: 'Plan the launch checklist' }],
        },
      }),
    )
    process.emitStdout(
      createNotification({
        type: 'assistant_text_delta',
        messageId: 'message-assistant-1',
        blockIndex: 0,
        textDelta: 'Here is the first step.',
      }),
    )
    process.emitStdout(
      createNotification({
        type: 'create_message',
        message: {
          id: 'message-assistant-1',
          role: 'assistant',
          createdAt: 2,
          updatedAt: 2,
          content: [{ type: 'text', text: 'Here is the first step.' }],
        },
      }),
    )

    await sendPromptPromise
    await waitFor(() => (manager.getSessionSnapshot('session-live-2')?.messages.length ?? 0) === 2)

    const snapshot = manager.getSessionSnapshot('session-live-2')
    expect(database.listSessions()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'session-live-2',
          hasUserMessage: true,
        }),
      ]),
    )

    expect(snapshot).toMatchObject({
      sessionId: 'session-live-2',
      title: 'Plan the launch checklist',
      status: 'active',
      messages: [
        {
          id: 'message-user-1',
          role: 'user',
          content: 'Plan the launch checklist',
        },
        {
          id: 'message-assistant-1',
          role: 'assistant',
          content: 'Here is the first step.',
        },
      ],
    })
    expect(snapshot?.events.map((event) => event.type)).toEqual([
      'message.completed',
      'message.delta',
      'message.completed',
    ])
    expect(database.getSession('session-live-2')).toMatchObject({
      id: 'session-live-2',
      title: 'Plan the launch checklist',
      status: 'active',
      projectWorkspacePath: '/tmp/live-session',
    })
  })

  it('tracks available models and updates session settings before subsequent messages', async () => {
    const userDataPath = mkdtempSync(join(tmpdir(), 'oxox-session-process-'))
    const database = createDatabaseService({
      userDataPath,
      databaseFactory: createSqliteDatabaseFactory(),
    })
    cleanup.push(() => database.close())

    const process = new FakeChildProcess(6_101)
    const spawnProcess = vi.fn(() => process)
    const manager = createSessionProcessManager({
      database,
      droidPath: '/opt/factory/bin/droid',
      droidSdkSessionFactory: createTestDroidSdkSessionFactory(spawnProcess),
      spawnProcess,
    })
    cleanup.push(() => manager.dispose())

    const createdPromise = manager.createSession({
      cwd: '/tmp/settings-session',
      viewerId: 'window-a',
    })

    await waitFor(() => process.writes.length === 1)
    process.emitStdout(
      createResponse(getRequestId(process), {
        sessionId: 'session-settings-1',
        session: { messages: [] },
        settings: {
          modelId: 'gpt-5.4',
          reasoningEffort: 'medium',
          interactionMode: 'auto',
        },
        availableModels: createAvailableModels(),
      }),
    )

    const created = await createdPromise

    expect(created.availableModels).toEqual([
      {
        id: 'gpt-5.4',
        name: 'GPT 5.4',
        provider: 'openai',
        supportedReasoningEfforts: ['medium', 'high'],
        defaultReasoningEffort: 'medium',
      },
      {
        id: 'gpt-5.4-mini',
        name: 'GPT 5.4 Mini',
        provider: 'openai',
        supportedReasoningEfforts: ['low', 'medium'],
        defaultReasoningEffort: 'low',
      },
    ])
    expect(created.settings).toMatchObject({
      modelId: 'gpt-5.4',
      interactionMode: 'auto',
    })

    const updatePromise = manager.updateSessionSettings('session-settings-1', {
      modelId: 'gpt-5.4-mini',
      interactionMode: 'spec',
    })

    await waitFor(() => process.writes.length === 2)
    const updateSettingsRequest = JSON.parse(process.writes[1] ?? '{}') as {
      id?: string
      method?: string
      params?: {
        modelId?: string
        interactionMode?: string
      }
    }

    expect(updateSettingsRequest.method).toBe('droid.update_session_settings')
    expect(updateSettingsRequest.params).toMatchObject({
      modelId: 'gpt-5.4-mini',
      interactionMode: 'spec',
    })

    process.emitStdout(createResponse(updateSettingsRequest.id ?? 'session:settings:1', {}))
    await updatePromise

    expect(manager.getSessionSnapshot('session-settings-1')).toMatchObject({
      settings: {
        modelId: 'gpt-5.4-mini',
        interactionMode: 'spec',
      },
    })
  })

  it('resolves concurrent permission callbacks with the correct request ids', async () => {
    const userDataPath = mkdtempSync(join(tmpdir(), 'oxox-session-process-'))
    const database = createDatabaseService({
      userDataPath,
      databaseFactory: createSqliteDatabaseFactory(),
    })
    cleanup.push(() => database.close())

    const process = new FakeChildProcess(6_201)
    const spawnProcess = vi.fn(() => process)
    const manager = createSessionProcessManager({
      database,
      droidPath: '/opt/factory/bin/droid',
      droidSdkSessionFactory: createTestDroidSdkSessionFactory(spawnProcess),
      spawnProcess,
    })
    cleanup.push(() => manager.dispose())

    const createdPromise = manager.createSession({
      cwd: '/tmp/permission-session',
      viewerId: 'window-a',
    })

    await waitFor(() => process.writes.length === 1)
    process.emitStdout(
      createResponse(getRequestId(process), {
        sessionId: 'session-permission-1',
        session: { messages: [] },
        settings: { modelId: 'gpt-5.4', reasoningEffort: 'medium' },
      }),
    )
    await createdPromise

    process.emitStdout(
      createCallback('permission-1', 'droid.request_permission', {
        toolUses: [
          {
            toolUse: {
              type: 'tool_use',
              id: 'tool-1',
              name: 'Execute',
              input: {},
            },
            confirmationType: 'exec',
            details: {
              type: 'exec',
              command: 'npm',
              fullCommand: 'npm publish',
              impactLevel: 'high',
            },
          },
        ],
        options: [
          { label: 'Approve', value: 'proceed_once' },
          { label: 'Deny', value: 'cancel' },
        ],
      }),
    )
    process.emitStdout(
      createCallback('permission-2', 'droid.request_permission', {
        toolUses: [
          {
            toolUse: {
              type: 'tool_use',
              id: 'tool-2',
              name: 'Read',
              input: {},
            },
            confirmationType: 'exec',
            details: {
              type: 'exec',
              command: 'cat',
              fullCommand: 'cat README.md',
              impactLevel: 'low',
            },
          },
        ],
        options: [
          { label: 'Approve', value: 'proceed_once' },
          { label: 'Deny', value: 'cancel' },
        ],
      }),
    )

    await waitFor(
      () =>
        (manager
          .getSessionSnapshot('session-permission-1')
          ?.events.filter((event) => event.type === 'permission.requested').length ?? 0) === 2,
    )

    await manager.resolvePermissionRequest('session-permission-1', 'permission-1', 'proceed_once')
    await manager.resolvePermissionRequest('session-permission-1', 'permission-2', 'cancel')

    expect(JSON.parse(process.writes[1] ?? '{}')).toMatchObject({
      id: 'permission-1',
      type: 'response',
      result: {
        selectedOption: 'proceed_once',
      },
    })
    expect(JSON.parse(process.writes[2] ?? '{}')).toMatchObject({
      id: 'permission-2',
      type: 'response',
      result: {
        selectedOption: 'cancel',
      },
    })
    expect(manager.getSessionSnapshot('session-permission-1')?.events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: 'permission.resolved',
          requestId: 'permission-1',
          selectedOption: 'proceed_once',
        }),
        expect.objectContaining({
          type: 'permission.resolved',
          requestId: 'permission-2',
          selectedOption: 'cancel',
        }),
      ]),
    )
  })

  it('responds to ask-user callbacks with the submitted answer payload', async () => {
    const userDataPath = mkdtempSync(join(tmpdir(), 'oxox-session-process-'))
    const database = createDatabaseService({
      userDataPath,
      databaseFactory: createSqliteDatabaseFactory(),
    })
    cleanup.push(() => database.close())

    const process = new FakeChildProcess(6_301)
    const spawnProcess = vi.fn(() => process)
    const manager = createSessionProcessManager({
      database,
      droidPath: '/opt/factory/bin/droid',
      droidSdkSessionFactory: createTestDroidSdkSessionFactory(spawnProcess),
      spawnProcess,
    })
    cleanup.push(() => manager.dispose())

    const createdPromise = manager.createSession({
      cwd: '/tmp/ask-user-session',
      viewerId: 'window-a',
    })

    await waitFor(() => process.writes.length === 1)
    process.emitStdout(
      createResponse(getRequestId(process), {
        sessionId: 'session-ask-user-1',
        session: { messages: [] },
        settings: { modelId: 'gpt-5.4', reasoningEffort: 'medium' },
      }),
    )
    await createdPromise

    process.emitStdout(
      createCallback('ask-1', 'droid.ask_user', {
        toolCallId: 'tool-ask-1',
        questions: [
          {
            index: 0,
            topic: 'Choice',
            question: 'Which word should I answer with?',
            options: ['ALPHA', 'BETA'],
          },
        ],
      }),
    )

    await waitFor(
      () =>
        manager
          .getSessionSnapshot('session-ask-user-1')
          ?.events.some((event) => event.type === 'askUser.requested') ?? false,
    )

    await manager.resolveAskUserRequest('session-ask-user-1', 'ask-1', [
      {
        index: 0,
        question: 'Which word should I answer with?',
        answer: 'ALPHA',
      },
    ])

    expect(JSON.parse(process.writes[1] ?? '{}')).toMatchObject({
      id: 'ask-1',
      type: 'response',
      result: {
        answers: [
          {
            index: 0,
            question: 'Which word should I answer with?',
            answer: 'ALPHA',
          },
        ],
      },
    })
    expect(manager.getSessionSnapshot('session-ask-user-1')?.events).toEqual(
      expect.arrayContaining([
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
          ],
        }),
      ]),
    )
  })

  it('preserves thinking, tool, title, settings, and token-usage notifications through the SDK-backed runtime', async () => {
    const userDataPath = mkdtempSync(join(tmpdir(), 'oxox-session-process-'))
    const database = createDatabaseService({
      userDataPath,
      databaseFactory: createSqliteDatabaseFactory(),
    })
    cleanup.push(() => database.close())

    const process = new FakeChildProcess(6_401)
    const spawnProcess = vi.fn(() => process)
    const manager = createSessionProcessManager({
      database,
      droidPath: '/opt/factory/bin/droid',
      droidSdkSessionFactory: createTestDroidSdkSessionFactory(spawnProcess),
      spawnProcess,
    })
    cleanup.push(() => manager.dispose())

    const createdPromise = manager.createSession({
      cwd: '/tmp/parity-session',
      viewerId: 'window-a',
    })

    await waitFor(() => process.writes.length === 1)
    process.emitStdout(
      createResponse(getRequestId(process), {
        sessionId: 'session-parity-1',
        session: { messages: [] },
        settings: { modelId: 'gpt-5.4', reasoningEffort: 'medium' },
      }),
    )
    await createdPromise

    process.emitStdout(
      createNotification({
        type: 'thinking_text_delta',
        messageId: 'thinking-1',
        blockIndex: 0,
        textDelta: 'Thinking through the next step',
      }),
    )
    process.emitStdout(
      createNotification({
        type: 'tool_progress_update',
        toolUseId: 'tool-1',
        toolName: 'Read',
        update: {
          status: 'running',
          details: 'Scanning the workspace',
        },
      }),
    )
    process.emitStdout(
      createNotification({
        type: 'tool_result',
        messageId: 'parity-tool-result-1',
        toolUseId: 'tool-1',
        toolName: 'Read',
        content: { loaded: true },
        isError: false,
      }),
    )
    process.emitStdout(
      createNotification({
        type: 'session_title_updated',
        title: 'Parity session',
      }),
    )
    process.emitStdout(
      createNotification({
        type: 'settings_updated',
        settings: {
          modelId: 'gpt-5.4-mini',
          autonomyLevel: 'medium',
        },
      }),
    )
    process.emitStdout(
      createNotification({
        type: 'session_token_usage_changed',
        sessionId: 'session-parity-1',
        tokenUsage: {
          inputTokens: 21,
          outputTokens: 13,
          cacheCreationTokens: 0,
          cacheReadTokens: 3,
          thinkingTokens: 5,
        },
      }),
    )

    await waitFor(() => (manager.getSessionSnapshot('session-parity-1')?.events.length ?? 0) >= 6)

    expect(manager.getSessionSnapshot('session-parity-1')).toMatchObject({
      title: 'Parity session',
      settings: {
        modelId: 'gpt-5.4-mini',
        autonomyLevel: 'medium',
      },
      events: expect.arrayContaining([
        expect.objectContaining({
          type: 'message.delta',
          channel: 'thinking',
          delta: 'Thinking through the next step',
        }),
        expect.objectContaining({
          type: 'tool.progress',
          toolName: 'Read',
          detail: 'Scanning the workspace',
        }),
        expect.objectContaining({
          type: 'tool.result',
          toolName: 'Read',
          content: { loaded: true },
          isError: false,
        }),
        expect.objectContaining({
          type: 'session.titleChanged',
          title: 'Parity session',
        }),
        expect.objectContaining({
          type: 'session.settingsChanged',
          settings: {
            modelId: 'gpt-5.4-mini',
            autonomyLevel: 'medium',
          },
        }),
        expect.objectContaining({
          type: 'session.tokenUsageChanged',
          tokenUsage: {
            inputTokens: 21,
            outputTokens: 13,
            cacheCreationTokens: 0,
            cacheReadTokens: 3,
            thinkingTokens: 5,
          },
        }),
      ]),
    })
  })
})
