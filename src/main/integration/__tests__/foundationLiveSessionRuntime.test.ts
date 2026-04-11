import { describe, expect, it, vi } from 'vitest'

import { createFoundationLiveSessionRuntime } from '../foundation/liveSessionRuntime'
import type { SessionEvent } from '../protocol/sessionEvents'
import type { LiveSessionSnapshot as RuntimeLiveSessionSnapshot } from '../sessions/types'

function createSnapshot(
  overrides: Partial<RuntimeLiveSessionSnapshot> & Pick<RuntimeLiveSessionSnapshot, 'sessionId'>,
): RuntimeLiveSessionSnapshot {
  return {
    sessionId: overrides.sessionId,
    title: overrides.title ?? 'Session title',
    status: overrides.status ?? 'active',
    transport: overrides.transport ?? 'stream-jsonrpc',
    processId: overrides.processId ?? 1234,
    viewerCount: overrides.viewerCount ?? 1,
    projectWorkspacePath: overrides.projectWorkspacePath ?? '/tmp/workspace',
    parentSessionId: overrides.parentSessionId ?? null,
    availableModels: overrides.availableModels ?? [{ id: 'gpt-5.4', name: 'GPT 5.4' }],
    settings: overrides.settings ?? { modelId: 'gpt-5.4', interactionMode: 'spec' },
    messages: overrides.messages ?? [],
    events: overrides.events ?? [],
  }
}

function createRuntimeEvent(
  overrides: Partial<SessionEvent> & Pick<SessionEvent, 'type'>,
): SessionEvent {
  return {
    type: overrides.type,
    ...overrides,
  }
}

describe('createFoundationLiveSessionRuntime', () => {
  it('delegates live-session commands and normalizes snapshot serialization', async () => {
    const processManager = {
      createSession: vi.fn().mockResolvedValue(
        createSnapshot({
          sessionId: 'session-created',
          events: [
            createRuntimeEvent({
              type: 'stream.error',
              error: new Error('stream failed'),
            }),
          ],
        }),
      ),
      getSessionSnapshot: vi.fn().mockReturnValue(null),
      listSessionSnapshots: vi.fn().mockReturnValue([]),
      subscribe: vi.fn().mockReturnValue(vi.fn()),
      attachSession: vi.fn().mockResolvedValue(createSnapshot({ sessionId: 'session-attached' })),
      detachSession: vi.fn().mockResolvedValue(createSnapshot({ sessionId: 'session-detached' })),
      addUserMessage: vi.fn().mockResolvedValue(undefined),
      renameSession: vi.fn().mockResolvedValue(undefined),
      updateSessionSettings: vi.fn().mockResolvedValue(undefined),
      resolvePermissionRequest: vi.fn().mockResolvedValue(undefined),
      resolveAskUserRequest: vi.fn().mockResolvedValue(undefined),
      getRewindInfo: vi.fn().mockResolvedValue({
        availableFiles: [],
        createdFiles: [],
        evictedFiles: [],
      }),
      executeRewind: vi.fn().mockResolvedValue({
        snapshot: createSnapshot({ sessionId: 'session-rewind' }),
        restoredCount: 2,
        deletedCount: 1,
        failedRestoreCount: 0,
        failedDeleteCount: 0,
      }),
      compactSession: vi.fn().mockResolvedValue({
        snapshot: createSnapshot({ sessionId: 'session-compact' }),
        removedCount: 3,
      }),
      forkSession: vi.fn().mockResolvedValue(createSnapshot({ sessionId: 'session-forked' })),
      interruptSession: vi.fn().mockResolvedValue(undefined),
      dispose: vi.fn().mockResolvedValue(undefined),
    }

    const runtime = createFoundationLiveSessionRuntime({
      sessionProcessManager: processManager,
    })

    await expect(runtime.createSession('/tmp/project', 'renderer:1')).resolves.toMatchObject({
      sessionId: 'session-created',
      events: [expect.objectContaining({ error: 'stream failed' })],
    })
    await expect(runtime.attachSession('session-attached', 'renderer:2')).resolves.toMatchObject({
      sessionId: 'session-attached',
    })
    await expect(runtime.detachSession('session-detached', 'renderer:3')).resolves.toMatchObject({
      sessionId: 'session-detached',
    })
    await expect(runtime.getRewindInfo('session-parent', 'message-1')).resolves.toEqual({
      availableFiles: [],
      createdFiles: [],
      evictedFiles: [],
    })
    await expect(
      runtime.executeRewind(
        'session-parent',
        {
          messageId: 'message-1',
          filesToRestore: [],
          filesToDelete: [],
          forkTitle: 'Rewinded session',
        },
        'renderer:3',
      ),
    ).resolves.toMatchObject({
      snapshot: { sessionId: 'session-rewind' },
      restoredCount: 2,
    })
    await expect(
      runtime.compactSession('session-parent', 'Keep only the latest context', 'renderer:4'),
    ).resolves.toMatchObject({
      snapshot: { sessionId: 'session-compact' },
      removedCount: 3,
    })
    await expect(runtime.forkSession('session-parent', 'renderer:4')).resolves.toMatchObject({
      sessionId: 'session-forked',
    })

    expect(processManager.createSession).toHaveBeenCalledWith({
      cwd: '/tmp/project',
      viewerId: 'renderer:1',
    })
    expect(processManager.subscribe).toHaveBeenCalledWith('session-created', expect.any(Function))
    expect(processManager.attachSession).toHaveBeenCalledWith('session-attached', {
      viewerId: 'renderer:2',
    })
    expect(processManager.subscribe).toHaveBeenCalledWith('session-attached', expect.any(Function))
    expect(processManager.detachSession).toHaveBeenCalledWith('session-detached', 'renderer:3')
    expect(processManager.getRewindInfo).toHaveBeenCalledWith('session-parent', 'message-1')
    expect(processManager.executeRewind).toHaveBeenCalledWith('session-parent', {
      messageId: 'message-1',
      filesToRestore: [],
      filesToDelete: [],
      forkTitle: 'Rewinded session',
      viewerId: 'renderer:3',
    })
    expect(processManager.subscribe).toHaveBeenCalledWith('session-rewind', expect.any(Function))
    expect(processManager.compactSession).toHaveBeenCalledWith('session-parent', {
      customInstructions: 'Keep only the latest context',
      viewerId: 'renderer:4',
    })
    expect(processManager.subscribe).toHaveBeenCalledWith('session-compact', expect.any(Function))
    expect(processManager.forkSession).toHaveBeenCalledWith('session-parent', {
      viewerId: 'renderer:4',
    })
    expect(processManager.subscribe).toHaveBeenCalledWith('session-forked', expect.any(Function))
  })

  it('serializes snapshots returned from getters and preserves null snapshots', () => {
    const processManager = {
      createSession: vi.fn(),
      getSessionSnapshot: vi
        .fn()
        .mockReturnValueOnce(null)
        .mockReturnValueOnce(
          createSnapshot({
            sessionId: 'session-1',
            events: [
              createRuntimeEvent({
                type: 'stream.error',
                error: { message: 'not-an-error-instance' },
              }),
            ],
          }),
        ),
      listSessionSnapshots: vi.fn().mockReturnValue([
        createSnapshot({
          sessionId: 'session-2',
          events: [
            createRuntimeEvent({
              type: 'stream.error',
              error: 'plain-string-error',
            }),
          ],
        }),
      ]),
      subscribe: vi.fn().mockReturnValue(vi.fn()),
      attachSession: vi.fn(),
      detachSession: vi.fn(),
      addUserMessage: vi.fn(),
      renameSession: vi.fn(),
      updateSessionSettings: vi.fn(),
      resolvePermissionRequest: vi.fn(),
      resolveAskUserRequest: vi.fn(),
      getRewindInfo: vi.fn(),
      executeRewind: vi.fn(),
      compactSession: vi.fn(),
      forkSession: vi.fn(),
      interruptSession: vi.fn(),
      dispose: vi.fn(),
    }

    const runtime = createFoundationLiveSessionRuntime({
      sessionProcessManager: processManager,
    })

    expect(runtime.getSessionSnapshot('missing-session')).toBeNull()
    expect(runtime.getSessionSnapshot('session-1')).toMatchObject({
      events: [expect.objectContaining({ error: 'Unknown stream error' })],
    })
    expect(runtime.listLiveSessionSnapshots()).toMatchObject([
      {
        sessionId: 'session-2',
        events: [expect.objectContaining({ error: 'plain-string-error' })],
      },
    ])
  })

  it('returns lightweight notification summaries without requiring full live-session snapshots', () => {
    const listSessionNotificationSummaries = vi.fn().mockReturnValue([
      {
        sessionId: 'session-2',
        title: 'Background session',
        pendingPermissions: [{ requestId: 'permission-1', reason: 'Approve deploy' }],
        pendingAskUser: [{ requestId: 'ask-user-1', prompt: 'Pick a workspace' }],
        completionCount: 2,
      },
    ])
    const processManager = {
      createSession: vi.fn(),
      getSessionSnapshot: vi.fn(),
      listSessionSnapshots: vi.fn(),
      listSessionNotificationSummaries,
      subscribe: vi.fn().mockReturnValue(vi.fn()),
      attachSession: vi.fn(),
      detachSession: vi.fn(),
      addUserMessage: vi.fn(),
      renameSession: vi.fn(),
      updateSessionSettings: vi.fn(),
      resolvePermissionRequest: vi.fn(),
      resolveAskUserRequest: vi.fn(),
      getRewindInfo: vi.fn(),
      executeRewind: vi.fn(),
      compactSession: vi.fn(),
      forkSession: vi.fn(),
      interruptSession: vi.fn(),
      dispose: vi.fn(),
    }

    const runtime = createFoundationLiveSessionRuntime({
      sessionProcessManager: processManager,
    })

    expect(runtime.listLiveSessionNotificationSummaries()).toEqual([
      {
        sessionId: 'session-2',
        title: 'Background session',
        pendingPermissions: [{ requestId: 'permission-1', reason: 'Approve deploy' }],
        pendingAskUser: [{ requestId: 'ask-user-1', prompt: 'Pick a workspace' }],
        completionCount: 2,
      },
    ])
  })

  it('passes through non-serializing session commands and dispose', async () => {
    const processManager = {
      createSession: vi.fn(),
      getSessionSnapshot: vi.fn(),
      listSessionSnapshots: vi.fn(),
      subscribe: vi.fn().mockReturnValue(vi.fn()),
      attachSession: vi.fn(),
      detachSession: vi.fn(),
      addUserMessage: vi.fn().mockResolvedValue(undefined),
      renameSession: vi.fn().mockResolvedValue(undefined),
      updateSessionSettings: vi.fn().mockResolvedValue(undefined),
      resolvePermissionRequest: vi.fn().mockResolvedValue(undefined),
      resolveAskUserRequest: vi.fn().mockResolvedValue(undefined),
      getRewindInfo: vi.fn().mockResolvedValue({
        availableFiles: [],
        createdFiles: [],
        evictedFiles: [],
      }),
      executeRewind: vi.fn().mockResolvedValue({
        snapshot: createSnapshot({ sessionId: 'session-rewind' }),
        restoredCount: 1,
        deletedCount: 0,
        failedRestoreCount: 0,
        failedDeleteCount: 0,
      }),
      compactSession: vi.fn().mockResolvedValue({
        snapshot: createSnapshot({ sessionId: 'session-compact' }),
        removedCount: 1,
      }),
      forkSession: vi.fn(),
      interruptSession: vi.fn().mockResolvedValue(undefined),
      dispose: vi.fn().mockResolvedValue(undefined),
    }
    const onChange = vi.fn()

    const runtime = createFoundationLiveSessionRuntime({
      sessionProcessManager: processManager,
      onChange,
    })

    await runtime.renameSession('session-1', 'Renamed session')
    await runtime.getRewindInfo('session-1', 'message-1')
    await runtime.executeRewind(
      'session-1',
      {
        messageId: 'message-1',
        filesToRestore: [],
        filesToDelete: [],
        forkTitle: 'Rewinded session',
      },
      'renderer:5',
    )
    await runtime.compactSession('session-1', 'Trim context', 'renderer:6')
    await runtime.addUserMessage('session-1', 'hello')
    await runtime.updateSessionSettings('session-1', { modelId: 'gpt-5.4-mini' })
    await runtime.resolvePermissionRequest('session-1', 'request-1', 'allow')
    expect(processManager.renameSession).toHaveBeenCalledWith('session-1', 'Renamed session')
    await runtime.resolveAskUserRequest('session-1', 'request-2', [
      {
        index: 0,
        question: 'Which answer?',
        answer: 'answer',
      },
    ])
    await runtime.interruptSession('session-1')
    await runtime.dispose()

    expect(processManager.addUserMessage).toHaveBeenCalledWith('session-1', 'hello')
    expect(processManager.updateSessionSettings).toHaveBeenCalledWith('session-1', {
      modelId: 'gpt-5.4-mini',
    })
    expect(processManager.resolvePermissionRequest).toHaveBeenCalledWith(
      'session-1',
      'request-1',
      'allow',
    )
    expect(processManager.resolveAskUserRequest).toHaveBeenCalledWith('session-1', 'request-2', [
      {
        index: 0,
        question: 'Which answer?',
        answer: 'answer',
      },
    ])
    expect(processManager.interruptSession).toHaveBeenCalledWith('session-1')
    expect(processManager.getRewindInfo).toHaveBeenCalledWith('session-1', 'message-1')
    expect(processManager.executeRewind).toHaveBeenCalledWith('session-1', {
      messageId: 'message-1',
      filesToRestore: [],
      filesToDelete: [],
      forkTitle: 'Rewinded session',
      viewerId: 'renderer:5',
    })
    expect(processManager.compactSession).toHaveBeenCalledWith('session-1', {
      customInstructions: 'Trim context',
      viewerId: 'renderer:6',
    })
    expect(processManager.dispose).toHaveBeenCalledTimes(1)
    expect(onChange).toHaveBeenCalledTimes(8)
  })

  it('pushes live-session ids to subscribers when runtime sessions update', async () => {
    const unsubscribeSessionEvents = vi.fn()
    const processManager = {
      createSession: vi
        .fn()
        .mockResolvedValue(createSnapshot({ sessionId: 'session-live-1', messages: [] })),
      getSessionSnapshot: vi.fn().mockReturnValue(
        createSnapshot({
          sessionId: 'session-live-1',
          events: [
            createRuntimeEvent({
              type: 'stream.error',
              error: new Error('stream failed'),
            }),
          ],
        }),
      ),
      listSessionSnapshots: vi.fn().mockReturnValue([]),
      subscribe: vi.fn().mockImplementation((_sessionId, sink) => {
        processManager.__sink = sink
        return unsubscribeSessionEvents
      }),
      attachSession: vi.fn(),
      detachSession: vi.fn(),
      addUserMessage: vi.fn(),
      renameSession: vi.fn(),
      updateSessionSettings: vi.fn(),
      resolvePermissionRequest: vi.fn(),
      resolveAskUserRequest: vi.fn(),
      getRewindInfo: vi.fn(),
      executeRewind: vi.fn(),
      compactSession: vi.fn(),
      forkSession: vi.fn(),
      interruptSession: vi.fn(),
      dispose: vi.fn().mockResolvedValue(undefined),
      __sink: undefined as ((event: unknown) => void) | undefined,
    }

    const runtime = createFoundationLiveSessionRuntime({
      sessionProcessManager: processManager,
    })
    const listener = vi.fn()
    const unsubscribe = runtime.subscribeToSnapshots(listener)

    await runtime.createSession('/tmp/project', 'renderer:1')
    processManager.__sink?.({ type: 'message.delta' })

    expect(listener).toHaveBeenCalledWith('session-live-1')

    unsubscribe()
    await runtime.dispose()

    expect(unsubscribeSessionEvents).toHaveBeenCalledTimes(1)
  })
})
