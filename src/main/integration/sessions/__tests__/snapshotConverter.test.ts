import { describe, expect, it } from 'vitest'

import {
  normalizeAvailableModels,
  normalizeSessionSettings,
  toSnapshot,
  toVisibleStatus,
} from '../snapshotConverter'
import type { ManagedSession } from '../types'

function createManagedSession(overrides: Partial<ManagedSession> = {}): ManagedSession {
  return {
    sessionId: 'session-1',
    title: 'Test session',
    cwd: '/tmp/test',
    createdAt: '2026-04-10T00:00:00.000Z',
    updatedAt: '2026-04-10T00:00:00.000Z',
    parentSessionId: null,
    processId: 1234,
    transport: null,
    messages: [{ id: 'm-1', role: 'user', content: 'hello' }],
    events: [],
    availableModels: [{ id: 'gpt-5.4', name: 'GPT 5.4' }],
    settings: { modelId: 'gpt-5.4' },
    transcriptRevision: 2,
    viewerIds: new Set(['viewer-1']),
    subscribers: new Set(),
    reconnectPromise: null,
    workingStatus: 'active',
    lastEventAt: null,
    ...overrides,
  }
}

describe('snapshotConverter', () => {
  it('converts working status into the visible session status', () => {
    expect(toVisibleStatus(createManagedSession())).toBe('active')
    expect(toVisibleStatus(createManagedSession({ viewerIds: new Set() }))).toBe('disconnected')
    expect(
      toVisibleStatus(createManagedSession({ workingStatus: 'completed', viewerIds: new Set() })),
    ).toBe('completed')
  })

  it('creates snapshots with cloned state', () => {
    const session = createManagedSession()
    const snapshot = toSnapshot(session)
    const snapshotMessage = snapshot.messages[0]
    const originalMessage = session.messages[0]

    expect(snapshot).toMatchObject({
      sessionId: 'session-1',
      title: 'Test session',
      status: 'active',
      viewerCount: 1,
      processId: 1234,
      projectWorkspacePath: '/tmp/test',
      transcriptRevision: 2,
    })

    expect(snapshotMessage).toBeDefined()
    expect(originalMessage).toBeDefined()

    if (!snapshotMessage || !originalMessage) {
      throw new Error('Expected seeded messages for clone assertions.')
    }

    snapshotMessage.content = 'changed'
    expect(originalMessage.content).toBe('hello')
  })

  it('normalizes settings and models with sensible fallbacks', () => {
    expect(
      normalizeSessionSettings({ interactionMode: 'plan' }, [{ id: 'gpt-5.4' }] as never),
    ).toEqual({
      interactionMode: 'plan',
      modelId: 'gpt-5.4',
    })

    expect(normalizeAvailableModels([], { modelId: 'gpt-5.4' })).toEqual([
      {
        id: 'gpt-5.4',
        name: 'gpt-5.4',
      },
    ])
  })
})
