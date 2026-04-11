import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { describe, expect, it, vi } from 'vitest'

import type { LiveSessionSnapshot, SessionRecord } from '../../../shared/ipc/contracts'
import { createDaemonSessionControl } from '../daemon/sessionControl'

function createSnapshot(overrides: Partial<LiveSessionSnapshot> = {}): LiveSessionSnapshot {
  return {
    sessionId: 'session-alpha',
    title: 'Alpha session',
    status: 'active',
    transport: 'stream-jsonrpc',
    processId: 42,
    viewerCount: 1,
    projectWorkspacePath: '/tmp/project-alpha',
    parentSessionId: null,
    availableModels: [],
    settings: {},
    messages: [],
    events: [],
    ...overrides,
  }
}

function createSessionRecord(
  overrides: Partial<SessionRecord> & Pick<SessionRecord, 'id'>,
): SessionRecord {
  return {
    id: overrides.id,
    projectId: overrides.projectId ?? null,
    projectWorkspacePath: overrides.projectWorkspacePath ?? '/tmp/project-alpha',
    projectDisplayName: overrides.projectDisplayName ?? null,
    modelId: overrides.modelId ?? null,
    parentSessionId: overrides.parentSessionId ?? null,
    derivationType: overrides.derivationType ?? null,
    hasUserMessage: overrides.hasUserMessage ?? true,
    title: overrides.title ?? 'Alpha session',
    status: overrides.status ?? 'idle',
    transport: overrides.transport ?? 'daemon',
    createdAt: overrides.createdAt ?? '2026-04-07T00:00:00.000Z',
    lastActivityAt: overrides.lastActivityAt ?? '2026-04-07T00:00:00.000Z',
    updatedAt: overrides.updatedAt ?? '2026-04-07T00:00:00.000Z',
  }
}

describe('createDaemonSessionControl', () => {
  it('forks via daemon, refreshes catalog state, and attaches the new session', async () => {
    const daemonTransport = {
      supportsMethod: vi.fn().mockReturnValue(true),
      forkSession: vi.fn().mockResolvedValue({ newSessionId: 'session-beta' }),
      renameSession: vi.fn(),
      refreshSessions: vi.fn().mockResolvedValue(undefined),
    }
    const sessionCatalog = {
      syncArtifacts: vi.fn().mockResolvedValue(undefined),
      listSessions: vi
        .fn()
        .mockReturnValue([createSessionRecord({ id: 'session-beta', title: 'Beta session' })]),
    }
    const liveSessionRuntime = {
      attachSession: vi.fn().mockResolvedValue(
        createSnapshot({
          sessionId: 'session-beta',
          title: 'Beta session',
          status: 'idle',
        }),
      ),
      renameSession: vi.fn(),
    }

    const control = createDaemonSessionControl({
      daemonTransport,
      sessionCatalog,
      liveSessionRuntime,
      sessionsRoot: tmpdir(),
    })

    const snapshot = await control.forkSession('session-alpha', 'renderer:1')

    expect(snapshot.sessionId).toBe('session-beta')
    expect(daemonTransport.forkSession).toHaveBeenCalledWith('session-alpha')
    expect(daemonTransport.refreshSessions).toHaveBeenCalledTimes(1)
    expect(sessionCatalog.syncArtifacts).toHaveBeenCalledTimes(1)
    expect(liveSessionRuntime.attachSession).toHaveBeenCalledWith('session-beta', 'renderer:1')
  })

  it('renames via daemon and fails if the refreshed catalog never shows the new title', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'oxox-daemon-session-control-'))
    const sourcePath = join(directory, 'session-alpha.jsonl')
    writeFileSync(
      sourcePath,
      [
        JSON.stringify({
          type: 'session_start',
          id: 'session-alpha',
          title: 'Old title',
        }),
        JSON.stringify({
          type: 'message',
          id: 'message-1',
          message: {
            role: 'user',
            content: [{ type: 'text', text: 'Keep this line unchanged' }],
          },
        }),
      ].join('\n'),
      'utf8',
    )

    const daemonTransport = {
      supportsMethod: vi
        .fn()
        .mockImplementation((method: string) => method === 'daemon.fork_session'),
      forkSession: vi.fn(),
      renameSession: vi.fn(),
      refreshSessions: vi.fn().mockResolvedValue(undefined),
    }
    const sessionCatalog = {
      syncArtifacts: vi.fn().mockResolvedValue(undefined),
      listSessions: vi
        .fn()
        .mockReturnValue([createSessionRecord({ id: 'session-alpha', title: 'New title' })]),
    }
    const liveSessionRuntime = {
      attachSession: vi.fn(),
      renameSession: vi.fn().mockResolvedValue(undefined),
    }

    const control = createDaemonSessionControl({
      daemonTransport,
      sessionCatalog,
      liveSessionRuntime,
      sessionsRoot: directory,
    })

    await expect(control.renameSession('session-alpha', 'New title')).resolves.toBeUndefined()

    expect(daemonTransport.renameSession).not.toHaveBeenCalled()
    expect(liveSessionRuntime.renameSession).toHaveBeenCalledWith('session-alpha', 'New title')
    expect(readFileSync(sourcePath, 'utf8').split('\n')[0]).toContain('"sessionTitle":"New title"')
    expect(readFileSync(sourcePath, 'utf8').split('\n')[0]).toContain(
      '"isSessionTitleManuallySet":true',
    )
  })
})
