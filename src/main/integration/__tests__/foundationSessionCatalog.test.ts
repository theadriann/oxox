import { describe, expect, it, vi } from 'vitest'

import type { SessionRecord } from '../../../shared/ipc/contracts'
import { createFoundationSessionCatalog } from '../foundation/sessionCatalog'

function createSession(
  overrides: Partial<SessionRecord> & Pick<SessionRecord, 'id'>,
): SessionRecord {
  return {
    id: overrides.id,
    projectId: overrides.projectId ?? null,
    projectWorkspacePath: overrides.projectWorkspacePath ?? null,
    projectDisplayName: overrides.projectDisplayName ?? null,
    modelId: overrides.modelId ?? null,
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

describe('createFoundationSessionCatalog', () => {
  it('performs an initial sync, polls for artifacts, and clears the timer on close', () => {
    const scanner = {
      sync: vi.fn(),
    }
    const database = {
      listPersistedSessions: vi.fn(() => []),
      listSessions: vi.fn(() => []),
    }
    const daemonTransport = {
      listSessions: vi.fn(() => []),
    }
    const intervalHandle = { id: 'artifact-poll' } as ReturnType<typeof setInterval>
    let scheduledSync: (() => void) | undefined
    const setIntervalFn = vi.fn((callback: () => void, _delay: number) => {
      scheduledSync = callback
      return intervalHandle
    })
    const clearIntervalFn = vi.fn()
    const onChange = vi.fn()

    const catalog = createFoundationSessionCatalog({
      database,
      scanner,
      daemonTransport,
      onChange,
      setIntervalFn,
      clearIntervalFn,
    })

    expect(scanner.sync).toHaveBeenCalledTimes(1)
    expect(onChange).toHaveBeenCalledTimes(1)
    expect(setIntervalFn).toHaveBeenCalledWith(expect.any(Function), 10_000)

    scheduledSync?.()

    expect(scanner.sync).toHaveBeenCalledTimes(2)
    expect(onChange).toHaveBeenCalledTimes(2)

    catalog.close()

    expect(clearIntervalFn).toHaveBeenCalledWith(intervalHandle)
  })

  it('does not emit a change event when the scheduled artifact sync reports no changes', () => {
    let scheduledSync: (() => void) | undefined
    const scanner = {
      sync: vi
        .fn()
        .mockReturnValueOnce({
          processedCount: 1,
          skippedCount: 0,
          deletedCount: 0,
          unreadableCount: 0,
          durationMs: 1,
        })
        .mockReturnValueOnce({
          processedCount: 0,
          skippedCount: 1,
          deletedCount: 0,
          unreadableCount: 0,
          durationMs: 1,
        }),
    }
    const database = {
      listPersistedSessions: vi.fn(() => []),
      listSessions: vi.fn(() => []),
    }
    const daemonTransport = {
      listSessions: vi.fn(() => []),
    }
    const setIntervalFn = vi.fn((callback: () => void) => {
      scheduledSync = callback
      return {} as ReturnType<typeof setInterval>
    })
    const onChange = vi.fn()

    createFoundationSessionCatalog({
      database,
      scanner,
      daemonTransport,
      onChange,
      setIntervalFn,
      clearIntervalFn: vi.fn(),
    })

    expect(onChange).toHaveBeenCalledTimes(1)

    scheduledSync?.()

    expect(onChange).toHaveBeenCalledTimes(1)
  })

  it('awaits artifact refresh so callers can verify persisted session state', async () => {
    const scanner = {
      sync: vi.fn().mockResolvedValue({
        processedCount: 1,
        skippedCount: 0,
        deletedCount: 0,
        unreadableCount: 0,
        durationMs: 1,
      }),
    }
    const database = {
      listPersistedSessions: vi.fn(() => []),
      listSessions: vi.fn(() => []),
    }
    const daemonTransport = {
      listSessions: vi.fn(() => []),
    }

    const catalog = createFoundationSessionCatalog({
      database,
      scanner,
      daemonTransport,
      setIntervalFn: vi.fn(() => ({}) as ReturnType<typeof setInterval>),
      clearIntervalFn: vi.fn(),
    })

    await expect(catalog.syncArtifacts()).resolves.toBeUndefined()
    expect(scanner.sync).toHaveBeenCalled()
  })

  it('does not start a second artifact scan while an async scan is already in flight', async () => {
    let scheduledSync: (() => void) | undefined
    const resolveSyncs: Array<
      (value: {
        processedCount: number
        skippedCount: number
        deletedCount: number
        unreadableCount: number
        durationMs: number
      }) => void
    > = []
    const scanner = {
      sync: vi.fn(
        () =>
          new Promise<{
            processedCount: number
            skippedCount: number
            deletedCount: number
            unreadableCount: number
            durationMs: number
          }>((resolve) => {
            resolveSyncs.push(resolve)
          }),
      ),
    }
    const database = {
      listPersistedSessions: vi.fn(() => []),
      listSessions: vi.fn(() => []),
    }
    const daemonTransport = {
      listSessions: vi.fn(() => []),
    }
    const onChange = vi.fn()

    createFoundationSessionCatalog({
      database,
      scanner,
      daemonTransport,
      onChange,
      setIntervalFn: vi.fn((callback: () => void) => {
        scheduledSync = callback
        return {} as ReturnType<typeof setInterval>
      }),
      clearIntervalFn: vi.fn(),
    })

    expect(scanner.sync).toHaveBeenCalledTimes(1)

    scheduledSync?.()

    expect(scanner.sync).toHaveBeenCalledTimes(1)

    resolveSyncs[0]?.({
      processedCount: 1,
      skippedCount: 0,
      deletedCount: 0,
      unreadableCount: 0,
      durationMs: 1,
    })

    await new Promise((resolve) => setTimeout(resolve, 0))

    expect(scanner.sync).toHaveBeenCalledTimes(2)

    resolveSyncs[1]?.({
      processedCount: 1,
      skippedCount: 0,
      deletedCount: 0,
      unreadableCount: 0,
      durationMs: 1,
    })

    await new Promise((resolve) => setTimeout(resolve, 0))

    expect(onChange).toHaveBeenCalledTimes(2)
  })

  it('reconciles cached, artifact, and daemon sessions before applying the live overlay', () => {
    const artifactShared = createSession({
      id: 'session-shared',
      title: 'Artifact title',
      status: 'idle',
      transport: 'artifacts',
      projectWorkspacePath: '/tmp/artifact-workspace',
      lastActivityAt: '2026-03-24T20:03:00.000Z',
      updatedAt: '2026-03-24T20:03:00.000Z',
    })
    const artifactOnly = createSession({
      id: 'session-artifact-only',
      title: 'Artifact only session',
      status: 'completed',
      transport: 'artifacts',
      projectWorkspacePath: '/tmp/artifact-only',
      lastActivityAt: '2026-03-24T20:04:00.000Z',
      updatedAt: '2026-03-24T20:04:00.000Z',
    })
    const cachedShared = createSession({
      id: 'session-shared',
      title: 'Cached title',
      status: 'completed',
      projectWorkspacePath: '/tmp/cache-workspace',
      updatedAt: '2026-03-24T20:01:00.000Z',
    })
    const cacheOnly = createSession({
      id: 'session-cache-only',
      title: 'Cache only session',
      status: 'waiting',
      updatedAt: '2026-03-24T20:02:00.000Z',
    })
    const daemonShared = createSession({
      id: 'session-shared',
      title: 'Daemon title',
      status: 'active',
      transport: 'daemon',
      projectWorkspacePath: null,
      lastActivityAt: null,
      updatedAt: '2026-03-24T20:04:30.000Z',
    })
    const daemonOnly = createSession({
      id: 'session-daemon-only',
      title: 'Daemon only session',
      status: 'active',
      transport: 'daemon',
      lastActivityAt: '2026-03-24T20:03:30.000Z',
      updatedAt: '2026-03-24T20:03:30.000Z',
    })
    const liveOverlayShared = createSession({
      id: 'session-shared',
      title: 'Live overlay title',
      status: 'active',
      transport: 'daemon',
      projectWorkspacePath: '/tmp/artifact-workspace',
      lastActivityAt: '2026-03-24T20:05:00.000Z',
      updatedAt: '2026-03-24T20:05:00.000Z',
    })

    let persistedSessions: SessionRecord[] = []
    const scanner = {
      sync: vi.fn(() => {
        persistedSessions = [artifactShared, artifactOnly]
      }),
    }
    const database = {
      listPersistedSessions: vi.fn(() => persistedSessions),
      listSessions: vi.fn(() => [liveOverlayShared]),
    }
    const daemonTransport = {
      listSessions: vi.fn(() => [daemonShared, daemonOnly]),
    }

    const catalog = createFoundationSessionCatalog({
      database,
      scanner,
      daemonTransport,
      setIntervalFn: vi.fn(() => ({}) as ReturnType<typeof setInterval>),
      clearIntervalFn: vi.fn(),
    })

    persistedSessions = [cachedShared, cacheOnly]

    expect(catalog.listSessions()).toEqual([artifactOnly, daemonOnly, liveOverlayShared, cacheOnly])
  })
})
