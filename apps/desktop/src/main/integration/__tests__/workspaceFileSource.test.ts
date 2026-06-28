import { describe, expect, it } from 'vitest'

import { resolveWorkspaceFileAccessTarget } from '../workspaceFiles/source'

describe('resolveWorkspaceFileAccessTarget', () => {
  it('prefers the selected local workspace path even when the session is daemon-backed', () => {
    expect(
      resolveWorkspaceFileAccessTarget({
        sessionId: 'session-1',
        isDaemonBackedSession: true,
        liveSessions: [{ sessionId: 'session-1', projectWorkspacePath: '/workspace/oxox' }],
        catalogSessions: [{ id: 'session-1', projectWorkspacePath: '/workspace/from-catalog' }],
      }),
    ).toEqual({
      kind: 'local',
      workspacePath: '/workspace/oxox',
    })
  })

  it('falls back to daemon workspace files only when no local workspace path is known', () => {
    expect(
      resolveWorkspaceFileAccessTarget({
        sessionId: 'session-remote',
        isDaemonBackedSession: true,
        liveSessions: [],
        catalogSessions: [{ id: 'session-remote', projectWorkspacePath: null }],
      }),
    ).toEqual({ kind: 'daemon' })
  })
})
