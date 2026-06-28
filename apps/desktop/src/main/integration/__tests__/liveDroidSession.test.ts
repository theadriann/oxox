import { type DroidClient, SDK_TAG } from '@factory/droid-sdk'
import { describe, expect, it, vi } from 'vitest'

import {
  createOxoxLiveDroidSession,
  loadOxoxLiveDroidSession,
  OxoxLiveDroidSession,
} from '../droidSdk/liveDroidSession'

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

class FakeDroidClient {
  sessionId: string | null = null

  readonly initializeSessionCalls: Array<Record<string, unknown>> = []
  readonly loadSessionCalls: Array<Record<string, unknown>> = []
  readonly addUserMessageCalls: Array<Record<string, unknown>> = []
  readonly updateSessionSettingsCalls: Array<Record<string, unknown>> = []
  readonly closeSessionCalls: Array<Record<string, unknown>> = []
  private readonly notificationHandlers = new Set<(notification: Record<string, unknown>) => void>()
  interruptSessionCalls = 0
  closeCalls = 0
  forkSessionCalls = 0

  async initializeSession(params: Record<string, unknown>) {
    this.initializeSessionCalls.push(params)
    this.sessionId = 'session-created'
    return {
      sessionId: 'session-created',
      session: { messages: [] },
      settings: { modelId: 'gpt-5.4' },
      availableModels: [],
      cwd: '/tmp/project',
    }
  }

  async loadSession(params: Record<string, unknown>) {
    this.loadSessionCalls.push(params)
    this.sessionId = String(params.sessionId)
    return {
      session: { messages: [] },
      settings: { modelId: 'gpt-5.4' },
      availableModels: [],
      cwd: '/tmp/project',
    }
  }

  async addUserMessage(params: Record<string, unknown>) {
    this.addUserMessageCalls.push(params)
    return {}
  }

  onNotification(callback: (notification: Record<string, unknown>) => void): () => void {
    this.notificationHandlers.add(callback)
    return () => {
      this.notificationHandlers.delete(callback)
    }
  }

  async updateSessionSettings(params: Record<string, unknown>) {
    this.updateSessionSettingsCalls.push(params)
    return {}
  }

  async interruptSession() {
    this.interruptSessionCalls += 1
    return {}
  }

  async forkSession() {
    this.forkSessionCalls += 1
    return { newSessionId: 'session-forked' }
  }

  async closeSession(params: Record<string, unknown>) {
    this.closeSessionCalls.push(params)
    return {}
  }

  async close() {
    this.closeCalls += 1
  }
}

describe('OxoxLiveDroidSession', () => {
  it('sends user messages through SDK DroidSession stream instead of the raw client', async () => {
    const client = {
      addUserMessage: vi.fn(() => {
        throw new Error('raw client send should not be used')
      }),
    }
    const sdkSession = {
      sessionId: 'session-1',
      initResult: { session: { messages: [] } },
      stream: vi.fn(async function* () {
        yield* []
      }),
    }
    const session = new OxoxLiveDroidSession(client as unknown as DroidClient, sdkSession as never)

    const messageId = await session.addUserMessage({
      text: 'Continue from OXOX',
      messageId: 'rewind-boundary-1',
      queuePlacement: 'end_of_turn',
    })
    await Promise.resolve()

    expect(messageId).toBe('rewind-boundary-1')
    expect(client.addUserMessage).not.toHaveBeenCalled()
    expect(sdkSession.stream).toHaveBeenCalledWith('Continue from OXOX', {
      messageId: 'rewind-boundary-1',
      queuePlacement: 'end_of_turn',
    })
  })

  it('reports SDK stream drain errors to the session owner', async () => {
    const streamError = new Error('SDK stream failed')
    const client = {
      addUserMessage: vi.fn(() => {
        throw new Error('raw client send should not be used')
      }),
    }
    const sdkSession = {
      sessionId: 'session-1',
      initResult: { session: { messages: [] } },
      stream: vi.fn(() => ({
        [Symbol.asyncIterator]: () => ({
          next: async () => {
            throw streamError
          },
        }),
      })),
    }
    const onStreamError = vi.fn()
    const session = new OxoxLiveDroidSession(
      client as unknown as DroidClient,
      sdkSession as never,
      [],
      { onStreamError },
    )

    await session.addUserMessage({
      text: 'Continue from OXOX',
      messageId: 'message-1',
    })

    await waitFor(() => onStreamError.mock.calls.length === 1)
    expect(onStreamError).toHaveBeenCalledWith(streamError)
  })

  it('sends stream-jsonrpc rewind calls with the active session id', async () => {
    const sendRequest = vi
      .fn()
      .mockResolvedValueOnce({
        availableFiles: [],
        createdFiles: [],
        evictedFiles: [],
      })
      .mockResolvedValueOnce({
        newSessionId: 'session-rewind',
        restoredCount: 0,
        deletedCount: 0,
        failedRestoreCount: 0,
        failedDeleteCount: 0,
      })
    const client = {
      _engine: {
        sendRequest,
      },
    }
    const sdkSession = {
      sessionId: 'session-1',
      initResult: { sessionId: 'session-1', session: { messages: [] } },
      getRewindInfo: vi.fn(),
      executeRewind: vi.fn(),
    }
    const session = new OxoxLiveDroidSession(client as unknown as DroidClient, sdkSession as never)

    await expect(session.getRewindInfo({ messageId: 'message-1' })).resolves.toEqual({
      availableFiles: [],
      createdFiles: [],
      evictedFiles: [],
    })
    await expect(
      session.executeRewind({
        messageId: 'message-1',
        filesToRestore: [],
        filesToDelete: [],
        forkTitle: 'Fork from here',
      }),
    ).resolves.toEqual({
      newSessionId: 'session-rewind',
      restoredCount: 0,
      deletedCount: 0,
      failedRestoreCount: 0,
      failedDeleteCount: 0,
    })

    expect(sendRequest).toHaveBeenNthCalledWith(
      1,
      'droid.get_rewind_info',
      {
        sessionId: 'session-1',
        messageId: 'message-1',
      },
      120_000,
    )
    expect(sendRequest).toHaveBeenNthCalledWith(
      2,
      'droid.execute_rewind',
      {
        sessionId: 'session-1',
        messageId: 'message-1',
        filesToRestore: [],
        filesToDelete: [],
        forkTitle: 'Fork from here',
      },
      120_000,
    )
    expect(sdkSession.getRewindInfo).not.toHaveBeenCalled()
    expect(sdkSession.executeRewind).not.toHaveBeenCalled()
  })

  it('creates SDK DroidSession lifecycle while preserving OXOX add-user-message options', async () => {
    const client = new FakeDroidClient()
    const session = await createOxoxLiveDroidSession(client as unknown as DroidClient, {
      cwd: '/tmp/project',
      settings: { modelId: 'gpt-5.4' },
    })

    const messageId = await session.addUserMessage({
      text: 'Continue from OXOX',
      messageId: 'rewind-boundary-1',
      queuePlacement: 'end_of_turn',
    })
    await session.updateSettings({ reasoningEffort: 'high' })
    await session.interrupt()
    await expect(session.fork()).resolves.toEqual({ newSessionId: 'session-forked' })
    await session.close()

    expect(session.sessionId).toBe('session-created')
    expect(session.initResult).toMatchObject({
      sessionId: 'session-created',
      cwd: '/tmp/project',
    })
    expect(messageId).toBe('rewind-boundary-1')
    expect(client.initializeSessionCalls).toEqual([
      {
        machineId: 'oxox-electron',
        cwd: '/tmp/project',
        modelId: 'gpt-5.4',
        tags: [SDK_TAG],
      },
    ])
    expect(client.addUserMessageCalls).toEqual([
      {
        text: 'Continue from OXOX',
        messageId: 'rewind-boundary-1',
        queuePlacement: 'end_of_turn',
      },
    ])
    expect(client.updateSessionSettingsCalls).toEqual([{ reasoningEffort: 'high' }])
    expect(client.interruptSessionCalls).toBe(1)
    expect(client.forkSessionCalls).toBe(1)
    expect(client.closeSessionCalls).toEqual([{ reason: 'other' }])
    expect(client.closeCalls).toBe(1)
  })

  it('loads an existing session through SDK lifecycle without requiring a cwd', async () => {
    const client = new FakeDroidClient()
    const session = await loadOxoxLiveDroidSession(
      client as unknown as DroidClient,
      'session-existing',
    )

    expect(session.sessionId).toBe('session-existing')
    expect(session.initResult).toMatchObject({
      cwd: '/tmp/project',
    })
    expect(client.loadSessionCalls).toEqual([{ sessionId: 'session-existing' }])
  })

  it('applies lifecycle hook params and closes lifecycle resources with the live session', async () => {
    const client = new FakeDroidClient()
    const cleanup = vi.fn().mockResolvedValue(undefined)
    const prepareInitialize = vi.fn().mockResolvedValue({
      cleanup,
      params: {
        workspaceId: 'workspace-1',
      },
    })

    const session = await createOxoxLiveDroidSession(
      client as unknown as DroidClient,
      {
        cwd: '/tmp/project',
        settings: {
          modelId: 'gpt-5.4',
        },
      },
      {
        lifecycleHooks: [
          {
            prepareInitialize,
          },
        ],
      },
    )

    expect(prepareInitialize).toHaveBeenCalledWith({
      getSessionId: expect.any(Function),
      request: {
        cwd: '/tmp/project',
        settings: {
          modelId: 'gpt-5.4',
        },
      },
    })
    expect(client.initializeSessionCalls[0]).toMatchObject({
      workspaceId: 'workspace-1',
    })

    await session.close()

    expect(cleanup).toHaveBeenCalledTimes(1)
  })
})
