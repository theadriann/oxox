import { describe, expect, it } from 'vitest'
import type { DaemonConnectionSnapshot, SessionRecord } from '../../../shared/ipc/contracts'

import { areDaemonSessionsEqual, getDaemonSnapshotUpdate } from '../daemon/snapshotDedup'

function createSession(overrides: Partial<SessionRecord> = {}): SessionRecord {
  return {
    id: overrides.id ?? 'session-1',
    projectId: overrides.projectId ?? null,
    projectWorkspacePath: overrides.projectWorkspacePath ?? '/tmp/project',
    projectDisplayName: overrides.projectDisplayName ?? null,
    hasUserMessage: overrides.hasUserMessage ?? false,
    title: overrides.title ?? 'Session',
    status: overrides.status ?? 'idle',
    transport: overrides.transport ?? 'daemon',
    createdAt: overrides.createdAt ?? '2026-04-10T00:00:00.000Z',
    lastActivityAt: overrides.lastActivityAt ?? '2026-04-10T00:00:00.000Z',
    updatedAt: overrides.updatedAt ?? '2026-04-10T00:00:00.000Z',
    parentSessionId: overrides.parentSessionId ?? null,
    derivationType: overrides.derivationType ?? null,
  }
}

function createSnapshot(
  overrides: Partial<DaemonConnectionSnapshot> = {},
): DaemonConnectionSnapshot {
  return {
    status: overrides.status ?? 'disconnected',
    connectedPort: overrides.connectedPort ?? null,
    lastError: overrides.lastError ?? null,
    lastConnectedAt: overrides.lastConnectedAt ?? null,
    lastSyncAt: overrides.lastSyncAt ?? null,
    nextRetryDelayMs: overrides.nextRetryDelayMs ?? null,
  }
}

describe('daemon snapshot dedup', () => {
  it('treats equal session lists as unchanged', () => {
    const left = [createSession()]
    const right = [createSession()]

    expect(areDaemonSessionsEqual(left, right)).toBe(true)
  })

  it('detects session list changes', () => {
    const left = [createSession()]
    const right = [createSession({ title: 'Renamed session' })]

    expect(areDaemonSessionsEqual(left, right)).toBe(false)
  })

  it('returns unchanged when a partial snapshot produces the same state', () => {
    const previous = createSnapshot({
      status: 'reconnecting',
      lastError: 'Daemon unavailable',
      nextRetryDelayMs: 1_000,
    })

    expect(
      getDaemonSnapshotUpdate(previous, {
        status: 'reconnecting',
        lastError: 'Daemon unavailable',
        nextRetryDelayMs: 1_000,
      }),
    ).toEqual({
      changed: false,
      nextSnapshot: previous,
    })
  })

  it('returns the merged snapshot when a field changes', () => {
    const previous = createSnapshot({
      status: 'reconnecting',
      nextRetryDelayMs: 1_000,
    })

    expect(
      getDaemonSnapshotUpdate(previous, {
        status: 'connected',
        connectedPort: 58051,
        nextRetryDelayMs: null,
      }),
    ).toEqual({
      changed: true,
      nextSnapshot: createSnapshot({
        status: 'connected',
        connectedPort: 58051,
        nextRetryDelayMs: null,
      }),
    })
  })
})
