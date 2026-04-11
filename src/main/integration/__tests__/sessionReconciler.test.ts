import { describe, expect, it } from 'vitest'

import type { SessionRecord } from '../../../shared/ipc/contracts'
import { reconcileSessionRecords } from '../sessions/reconcile'

function createSession(
  overrides: Partial<SessionRecord> & Pick<SessionRecord, 'id'>,
): SessionRecord {
  return {
    id: overrides.id,
    projectId: overrides.projectId ?? null,
    projectWorkspacePath: overrides.projectWorkspacePath ?? null,
    projectDisplayName: overrides.projectDisplayName ?? null,
    parentSessionId: overrides.parentSessionId ?? null,
    derivationType: overrides.derivationType ?? null,
    title: overrides.title ?? 'Untitled session',
    status: overrides.status ?? 'idle',
    transport: overrides.transport ?? null,
    createdAt: overrides.createdAt ?? '2026-03-24T20:00:00.000Z',
    lastActivityAt: overrides.lastActivityAt ?? null,
    updatedAt: overrides.updatedAt ?? '2026-03-24T20:05:00.000Z',
  }
}

describe('reconcileSessionRecords', () => {
  it('prefers artifact titles over daemon fallback titles while preserving daemon runtime metadata', () => {
    const cachedSession = createSession({
      id: 'session-shared',
      title: 'Cached title',
      status: 'completed',
      projectWorkspacePath: '/tmp/cache-workspace',
      lastActivityAt: null,
      updatedAt: '2026-03-24T20:01:00.000Z',
    })
    const artifactSession = createSession({
      id: 'session-shared',
      title: 'Artifact title',
      status: 'idle',
      transport: 'artifacts',
      projectWorkspacePath: '/tmp/artifact-workspace',
      lastActivityAt: '2026-03-24T20:03:00.000Z',
      updatedAt: '2026-03-24T20:03:00.000Z',
    })
    const daemonSession = createSession({
      id: 'session-shared',
      title: 'Daemon session',
      status: 'active',
      transport: 'daemon',
      projectWorkspacePath: null,
      lastActivityAt: null,
      updatedAt: '2026-03-24T20:04:00.000Z',
    })
    const cacheOnlySession = createSession({
      id: 'session-cache-only',
      title: 'Cached fallback',
      status: 'waiting',
      updatedAt: '2026-03-24T20:02:00.000Z',
    })

    const reconciled = reconcileSessionRecords({
      cachedSessions: [cachedSession, cacheOnlySession],
      artifactSessions: [artifactSession],
      daemonSessions: [daemonSession],
    })

    expect(reconciled).toHaveLength(2)
    expect(reconciled[0]).toEqual({
      ...daemonSession,
      title: 'Artifact title',
      projectWorkspacePath: '/tmp/artifact-workspace',
      lastActivityAt: '2026-03-24T20:03:00.000Z',
      createdAt: cachedSession.createdAt,
    })
    expect(reconciled[1]).toEqual(cacheOnlySession)
  })

  it('includes daemon-only sessions while keeping deterministic recency ordering', () => {
    const artifactSession = createSession({
      id: 'artifact-session',
      title: 'Artifact session',
      transport: 'artifacts',
      lastActivityAt: '2026-03-24T19:55:00.000Z',
      updatedAt: '2026-03-24T19:55:00.000Z',
    })
    const daemonOnlySession = createSession({
      id: 'daemon-session',
      title: 'Daemon only session',
      status: 'active',
      transport: 'daemon',
      lastActivityAt: '2026-03-24T20:10:00.000Z',
      updatedAt: '2026-03-24T20:10:00.000Z',
    })

    const reconciled = reconcileSessionRecords({
      cachedSessions: [],
      artifactSessions: [artifactSession],
      daemonSessions: [daemonOnlySession],
    })

    expect(reconciled.map((session) => session.id)).toEqual(['daemon-session', 'artifact-session'])
  })

  it('prefers newer daemon titles over artifact startup titles', () => {
    const artifactSession = createSession({
      id: 'session-shared',
      title: 'Original artifact title',
      transport: 'artifacts',
      updatedAt: '2026-03-24T20:03:00.000Z',
    })
    const daemonSession = createSession({
      id: 'session-shared',
      title: 'Renamed in live session',
      status: 'active',
      transport: 'daemon',
      updatedAt: '2026-03-24T20:04:00.000Z',
    })

    const [reconciled] = reconcileSessionRecords({
      cachedSessions: [],
      artifactSessions: [artifactSession],
      daemonSessions: [daemonSession],
    })

    expect(reconciled.title).toBe('Renamed in live session')
  })
})
