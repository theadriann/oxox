import { describe, expect, it } from 'vitest'

import { applyEventToSession } from '../eventApplier'
import type { ManagedSession } from '../types'

function createManagedSession(overrides: Partial<ManagedSession> = {}): ManagedSession {
  return {
    sessionId: 'session-1',
    title: 'Untitled session',
    cwd: '/tmp/test',
    createdAt: '2026-04-10T00:00:00.000Z',
    updatedAt: '2026-04-10T00:00:00.000Z',
    parentSessionId: null,
    processId: 1234,
    transport: null,
    messages: [],
    events: [],
    availableModels: [],
    settings: {},
    transcriptRevision: 0,
    viewerIds: new Set(['viewer-1']),
    subscribers: new Set(),
    reconnectPromise: null,
    workingStatus: 'active',
    lastEventAt: null,
    ...overrides,
  }
}

describe('eventApplier', () => {
  it('upserts completed messages and infers the title for untitled sessions', () => {
    const session = createManagedSession()

    applyEventToSession(
      session,
      {
        type: 'message.completed',
        messageId: 'm-1',
        role: 'user',
        content: 'Summarize the latest changes',
      },
      '2026-04-10T00:01:00.000Z',
    )

    expect(session.messages).toEqual([
      {
        id: 'm-1',
        role: 'user',
        content: 'Summarize the latest changes',
        contentBlocks: undefined,
      },
    ])
    expect(session.title).toBe('Summarize the latest changes')
    expect(session.lastEventAt).toBe('2026-04-10T00:01:00.000Z')
  })

  it('updates status/settings/title and normalizes models from session events', () => {
    const session = createManagedSession({
      settings: { modelId: 'gpt-5.4' },
    })

    applyEventToSession(
      session,
      {
        type: 'session.statusChanged',
        status: 'waiting',
      },
      '2026-04-10T00:01:00.000Z',
    )
    applyEventToSession(
      session,
      {
        type: 'session.settingsChanged',
        settings: { interactionMode: 'plan' },
      },
      '2026-04-10T00:02:00.000Z',
    )
    applyEventToSession(
      session,
      {
        type: 'session.titleChanged',
        title: 'Renamed',
      },
      '2026-04-10T00:03:00.000Z',
    )

    expect(session.workingStatus).toBe('waiting')
    expect(session.settings).toEqual({
      modelId: 'gpt-5.4',
      interactionMode: 'plan',
    })
    expect(session.availableModels).toEqual([{ id: 'gpt-5.4', name: 'gpt-5.4' }])
    expect(session.title).toBe('Renamed')
  })

  it('drops transport ownership and marks recoverable stream errors as reconnecting', () => {
    const session = createManagedSession({
      transport: { processId: 1234 } as never,
      processId: 1234,
    })

    applyEventToSession(
      session,
      {
        type: 'stream.error',
        error: new Error('socket closed'),
        recoverable: true,
      },
      '2026-04-10T00:01:00.000Z',
    )

    expect(session.transport).toBeNull()
    expect(session.processId).toBeNull()
    expect(session.workingStatus).toBe('reconnecting')
  })
})
