// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { FoundationRecordDelta, SessionRecord } from '../../../../../shared/ipc/contracts'
import { createMemoryPersistencePort } from '../../../platform/persistence'
import { createStoreEventBus } from '../../events/store-event-bus'
import { SessionStore } from '../session.model'

describe('SessionStore', () => {
  beforeEach(() => {
    window.localStorage.clear()
  })

  it('starts empty until foundation sessions are hydrated', () => {
    const store = new SessionStore()

    expect(store.sessions).toEqual([])
    expect(store.selectedSessionId).toBe('')
    expect(store.hasHydratedSessions).toBe(false)
  })

  it('preserves each session transport in renderer previews', () => {
    const store = new SessionStore()

    store.hydrateSessions([
      {
        id: 'session-daemon',
        projectId: 'project-alpha',
        projectWorkspacePath: '/tmp/project-alpha',
        projectDisplayName: null,
        title: 'Daemon session',
        status: 'active',
        transport: 'daemon',
        createdAt: '2026-03-24T08:00:00.000Z',
        lastActivityAt: '2026-03-24T09:00:00.000Z',
        updatedAt: '2026-03-24T09:00:00.000Z',
      },
    ])

    expect(store.sessions[0]?.transport).toBe('daemon')
    expect(store.sessionsById['session-daemon']?.transport).toBe('daemon')
  })

  it('groups sessions by project and sorts groups by most recent activity', () => {
    const store = new SessionStore()

    store.hydrateSessions([
      {
        id: 'session-alpha-old',
        projectId: 'project-alpha',
        projectWorkspacePath: '/tmp/project-alpha',
        projectDisplayName: null,
        title: 'Older alpha session',
        status: 'completed',
        transport: 'artifacts',
        createdAt: '2026-03-24T08:00:00.000Z',
        lastActivityAt: '2026-03-24T09:00:00.000Z',
        updatedAt: '2026-03-24T09:00:00.000Z',
      },
      {
        id: 'session-beta-new',
        projectId: 'project-beta',
        projectWorkspacePath: '/tmp/project-beta',
        projectDisplayName: null,
        title: 'Newest beta session',
        status: 'active',
        transport: 'artifacts',
        createdAt: '2026-03-24T10:00:00.000Z',
        lastActivityAt: '2026-03-24T11:30:00.000Z',
        updatedAt: '2026-03-24T11:30:00.000Z',
      },
      {
        id: 'session-alpha-new',
        projectId: 'project-alpha',
        projectWorkspacePath: '/tmp/project-alpha',
        projectDisplayName: null,
        title: 'Newer alpha session',
        status: 'waiting',
        transport: 'artifacts',
        createdAt: '2026-03-24T09:30:00.000Z',
        lastActivityAt: '2026-03-24T10:45:00.000Z',
        updatedAt: '2026-03-24T10:45:00.000Z',
      },
    ])

    expect(store.projectGroups.map((group) => group.label)).toEqual([
      'project-beta',
      'project-alpha',
    ])
    expect(store.projectGroups[1]?.sessions.map((session) => session.id)).toEqual([
      'session-alpha-new',
      'session-alpha-old',
    ])
    expect(store.selectedSessionId).toBe('session-beta-new')
  })

  it('keeps forked sessions top-level while nesting subagent sessions under their recorded parents', () => {
    const store = new SessionStore()

    store.hydrateSessions([
      {
        id: 'session-subagent',
        projectId: 'project-alpha',
        projectWorkspacePath: '/tmp/project-alpha',
        projectDisplayName: null,
        parentSessionId: 'session-fork',
        derivationType: 'subagent',
        title: 'Subagent child',
        status: 'completed',
        transport: 'artifacts',
        createdAt: '2026-03-24T10:00:00.000Z',
        lastActivityAt: '2026-03-24T10:30:00.000Z',
        updatedAt: '2026-03-24T10:30:00.000Z',
      },
      {
        id: 'session-fork',
        projectId: 'project-alpha',
        projectWorkspacePath: '/tmp/project-alpha',
        projectDisplayName: null,
        parentSessionId: 'session-root',
        derivationType: 'fork',
        title: 'Fork parent',
        status: 'idle',
        transport: 'artifacts',
        createdAt: '2026-03-24T09:00:00.000Z',
        lastActivityAt: '2026-03-24T09:30:00.000Z',
        updatedAt: '2026-03-24T09:30:00.000Z',
      },
      {
        id: 'session-root',
        projectId: 'project-alpha',
        projectWorkspacePath: '/tmp/project-alpha',
        projectDisplayName: null,
        parentSessionId: null,
        derivationType: null,
        title: 'Root parent',
        status: 'idle',
        transport: 'artifacts',
        createdAt: '2026-03-24T08:00:00.000Z',
        lastActivityAt: '2026-03-24T08:30:00.000Z',
        updatedAt: '2026-03-24T08:30:00.000Z',
      },
    ])

    expect(store.projectGroups[0]?.sessions.map((session) => session.id)).toEqual([
      'session-fork',
      'session-subagent',
      'session-root',
    ])
  })

  it('persists pinned sessions and project display name overrides across restarts', () => {
    const sessions = [
      {
        id: 'session-alpha',
        projectId: 'project-alpha',
        projectWorkspacePath: '/tmp/project-alpha',
        projectDisplayName: null,
        title: 'Alpha project work',
        status: 'active',
        transport: 'artifacts',
        createdAt: '2026-03-24T08:00:00.000Z',
        lastActivityAt: '2026-03-24T09:00:00.000Z',
        updatedAt: '2026-03-24T09:00:00.000Z',
      },
      {
        id: 'session-beta',
        projectId: 'project-beta',
        projectWorkspacePath: '/tmp/project-beta',
        projectDisplayName: null,
        title: 'Beta project work',
        status: 'waiting',
        transport: 'artifacts',
        createdAt: '2026-03-24T10:00:00.000Z',
        lastActivityAt: '2026-03-24T11:00:00.000Z',
        updatedAt: '2026-03-24T11:00:00.000Z',
      },
    ]

    const store = new SessionStore()

    store.hydrateSessions(sessions)
    store.togglePinnedSession('session-alpha')
    store.setProjectDisplayName('project-alpha', 'Factory Desktop')

    expect(store.pinnedSessions.map((session) => session.id)).toEqual(['session-alpha'])
    expect(store.projectGroups.find((group) => group.key === 'project-alpha')?.label).toBe(
      'Factory Desktop',
    )

    const restoredStore = new SessionStore()

    restoredStore.hydrateSessions(sessions)

    expect(restoredStore.pinnedSessions.map((session) => session.id)).toEqual(['session-alpha'])
    expect(restoredStore.projectGroups.find((group) => group.key === 'project-alpha')?.label).toBe(
      'Factory Desktop',
    )
  })

  it('persists pinned and archive preferences through an injected persistence port', () => {
    const persistence = createMemoryPersistencePort()
    const store = new SessionStore(persistence)

    store.hydrateSessions([
      {
        id: 'session-alpha',
        projectId: 'project-alpha',
        projectWorkspacePath: '/tmp/project-alpha',
        projectDisplayName: null,
        title: 'Alpha project work',
        status: 'active',
        transport: 'artifacts',
        createdAt: '2026-03-24T08:00:00.000Z',
        lastActivityAt: '2026-03-24T09:00:00.000Z',
        updatedAt: '2026-03-24T09:00:00.000Z',
      },
    ])
    store.togglePinnedSession('session-alpha')
    store.archiveSession('session-alpha')

    expect(persistence.get('oxox.session.preferences', {})).toEqual(
      expect.objectContaining({
        pinnedSessionIds: ['session-alpha'],
        archivedSessionIds: ['session-alpha'],
      }),
    )
  })

  it('removes deleted sessions from local lists and persisted preferences', () => {
    const persistence = createMemoryPersistencePort()
    const store = new SessionStore(persistence)

    store.hydrateSessions([
      {
        id: 'session-alpha',
        projectId: 'project-alpha',
        projectWorkspacePath: '/tmp/project-alpha',
        projectDisplayName: null,
        title: 'Alpha',
        status: 'completed',
        transport: 'artifacts',
        createdAt: '2026-03-24T08:00:00.000Z',
        lastActivityAt: '2026-03-24T09:00:00.000Z',
        updatedAt: '2026-03-24T09:00:00.000Z',
      },
      {
        id: 'session-beta',
        projectId: 'project-alpha',
        projectWorkspacePath: '/tmp/project-alpha',
        projectDisplayName: null,
        title: 'Beta',
        status: 'completed',
        transport: 'artifacts',
        createdAt: '2026-03-24T07:00:00.000Z',
        lastActivityAt: '2026-03-24T08:00:00.000Z',
        updatedAt: '2026-03-24T08:00:00.000Z',
      },
    ])
    store.togglePinnedSession('session-alpha')
    store.archiveSession('session-alpha')
    const folder = store.createSessionFolder('project-alpha', 'Saved')
    store.moveSessionToFolder('session-alpha', folder.id)
    store.selectSession('session-alpha')

    store.deleteSessionLocally('session-alpha')

    expect(store.sessions.map((session) => session.id)).toEqual(['session-beta'])
    expect(store.sessionsById['session-alpha']).toBeUndefined()
    expect(store.selectedSessionId).toBe('session-beta')
    expect(persistence.get('oxox.session.preferences', {})).toEqual(
      expect.objectContaining({
        pinnedSessionIds: [],
        archivedSessionIds: [],
        sessionFolderAssignments: {},
      }),
    )
  })

  it('persists folders and session assignments through an injected persistence port', () => {
    const persistence = createMemoryPersistencePort()
    const sessions: SessionRecord[] = [
      {
        id: 'session-alpha',
        projectId: 'project-alpha',
        projectWorkspacePath: '/tmp/project-alpha',
        projectDisplayName: null,
        parentSessionId: null,
        modelId: 'gpt-5.4',
        title: 'Alpha project work',
        status: 'active',
        transport: 'artifacts',
        createdAt: '2026-03-24T08:00:00.000Z',
        lastActivityAt: '2026-03-24T09:00:00.000Z',
        updatedAt: '2026-03-24T09:00:00.000Z',
      },
    ]
    const store = new SessionStore(persistence)

    store.hydrateSessions(sessions)
    const folder = store.createSessionFolder('project-alpha', 'Auth research')
    store.moveSessionToFolder('session-alpha', folder.id)

    const restoredStore = new SessionStore(persistence)
    restoredStore.hydrateSessions(sessions)

    expect(restoredStore.sessionFolders).toMatchObject([
      {
        id: folder.id,
        projectKey: 'project-alpha',
        name: 'Auth research',
        parentFolderId: null,
      },
    ])
    expect(restoredStore.sessionFolderAssignments).toEqual({
      'session-alpha': folder.id,
    })
  })

  it('writes folder mutations through the SQLite-backed bridge when available', async () => {
    const bridge = {
      upsertSessionFolder: vi.fn().mockResolvedValue(undefined),
      deleteSessionFolder: vi.fn().mockResolvedValue(undefined),
      setSessionFolderAssignment: vi.fn().mockResolvedValue(undefined),
      removeSessionFolderAssignment: vi.fn().mockResolvedValue(undefined),
    }
    const persistence = createMemoryPersistencePort()
    const store = new SessionStore(persistence, bridge)

    store.hydrateSessions([
      {
        id: 'session-alpha',
        projectId: 'project-alpha',
        projectWorkspacePath: '/tmp/project-alpha',
        projectDisplayName: null,
        parentSessionId: null,
        modelId: 'gpt-5.4',
        title: 'Alpha project work',
        status: 'active',
        transport: 'artifacts',
        createdAt: '2026-03-24T08:00:00.000Z',
        lastActivityAt: '2026-03-24T09:00:00.000Z',
        updatedAt: '2026-03-24T09:00:00.000Z',
      },
    ])

    const folder = store.createSessionFolder('project-alpha', 'Auth research')
    store.moveSessionToFolder('session-alpha', folder.id)
    store.moveSessionToProject('session-alpha', 'project-alpha')
    await store.flushFolderPersistenceWrites()

    expect(bridge.upsertSessionFolder).toHaveBeenCalledWith(
      expect.objectContaining({ id: folder.id, name: 'Auth research' }),
    )
    expect(bridge.setSessionFolderAssignment).toHaveBeenCalledWith(
      expect.objectContaining({ sessionId: 'session-alpha', folderId: folder.id }),
    )
    expect(bridge.removeSessionFolderAssignment).toHaveBeenCalledWith('session-alpha')
    expect(persistence.get('oxox.session.preferences', {})).not.toHaveProperty('sessionFolders')
  })

  it('hydrates SQLite-backed folders from foundation metadata without pruning missing sessions', () => {
    const store = new SessionStore(createMemoryPersistencePort(), {
      upsertSessionFolder: vi.fn().mockResolvedValue(undefined),
    })

    store.hydrateSessionFolderMetadata({
      folders: [
        {
          id: 'folder-preserved',
          projectKey: 'project-alpha',
          name: 'Preserved',
          parentFolderId: null,
          createdAt: '2026-03-24T08:00:00.000Z',
          updatedAt: '2026-03-24T08:00:00.000Z',
          order: 0,
        },
      ],
      assignments: [
        {
          sessionId: 'session-missing-during-reindex',
          folderId: 'folder-preserved',
          updatedAt: '2026-03-24T08:01:00.000Z',
        },
      ],
    })
    store.hydrateSessions([])

    expect(store.sessionFolders.map((folder) => folder.id)).toEqual(['folder-preserved'])
    expect(store.sessionFolderAssignments).toEqual({
      'session-missing-during-reindex': 'folder-preserved',
    })
  })

  it('keeps legacy folders visible while SQLite migration is pending', () => {
    const persistence = createMemoryPersistencePort({
      'oxox.session.preferences': {
        sessionFolders: [
          {
            id: 'folder-legacy',
            projectKey: 'project-alpha',
            name: 'Legacy folder',
            parentFolderId: null,
            createdAt: '2026-03-24T08:00:00.000Z',
            updatedAt: '2026-03-24T08:00:00.000Z',
            order: 0,
          },
        ],
        sessionFolderAssignments: {
          'session-alpha': 'folder-legacy',
        },
      },
    })
    const store = new SessionStore(persistence, {
      mergeSessionFolderMetadata: vi.fn().mockResolvedValue(undefined),
    })

    store.hydrateSessionFolderMetadata({ folders: [], assignments: [] })

    expect(store.sessionFolders.map((folder) => folder.id)).toEqual(['folder-legacy'])
    expect(store.sessionFolderAssignments).toEqual({
      'session-alpha': 'folder-legacy',
    })
  })

  it('supports nested folder moves and keeps child sessions out of folder assignments', () => {
    const store = new SessionStore(createMemoryPersistencePort())

    store.hydrateSessions([
      {
        id: 'session-parent',
        projectId: 'project-alpha',
        projectWorkspacePath: '/tmp/project-alpha',
        projectDisplayName: null,
        parentSessionId: null,
        modelId: 'gpt-5.4',
        title: 'Parent',
        status: 'active',
        transport: 'artifacts',
        createdAt: '2026-03-24T08:00:00.000Z',
        lastActivityAt: '2026-03-24T09:00:00.000Z',
        updatedAt: '2026-03-24T09:00:00.000Z',
      },
      {
        id: 'session-child',
        projectId: 'project-alpha',
        projectWorkspacePath: '/tmp/project-alpha',
        projectDisplayName: null,
        parentSessionId: 'session-parent',
        derivationType: 'subagent',
        modelId: 'gpt-5.4',
        title: 'Child',
        status: 'completed',
        transport: 'artifacts',
        createdAt: '2026-03-24T08:30:00.000Z',
        lastActivityAt: '2026-03-24T08:45:00.000Z',
        updatedAt: '2026-03-24T08:45:00.000Z',
      },
    ])

    const parentFolder = store.createSessionFolder('project-alpha', 'Feature')
    const childFolder = store.createSessionFolder('project-alpha', 'Fixes')

    store.moveFolder(childFolder.id, 'project-alpha', parentFolder.id)
    store.moveSessionToFolder('session-parent', childFolder.id)
    store.moveSessionToFolder('session-child', parentFolder.id)

    expect(
      store.sessionFolders.find((folder) => folder.id === childFolder.id)?.parentFolderId,
    ).toBe(parentFolder.id)
    expect(store.sessionFolderAssignments).toEqual({
      'session-parent': childFolder.id,
    })

    store.moveSessionToProject('session-parent', 'project-alpha')

    expect(store.sessionFolderAssignments).toEqual({})
  })

  it('cleans folder preferences for removed sessions and projects', () => {
    const persistence = createMemoryPersistencePort()
    const store = new SessionStore(persistence)

    store.hydrateSessions([
      {
        id: 'session-alpha',
        projectId: 'project-alpha',
        projectWorkspacePath: '/tmp/project-alpha',
        projectDisplayName: null,
        parentSessionId: null,
        modelId: 'gpt-5.4',
        title: 'Alpha',
        status: 'active',
        transport: 'artifacts',
        createdAt: '2026-03-24T08:00:00.000Z',
        lastActivityAt: '2026-03-24T09:00:00.000Z',
        updatedAt: '2026-03-24T09:00:00.000Z',
      },
    ])
    const folder = store.createSessionFolder('project-alpha', 'Feature')
    store.moveSessionToFolder('session-alpha', folder.id)

    store.hydrateSessions([])

    expect(store.sessionFolders).toEqual([])
    expect(store.sessionFolderAssignments).toEqual({})
    expect(persistence.get('oxox.session.preferences', {})).toEqual(
      expect.objectContaining({
        sessionFolders: [],
        sessionFolderAssignments: {},
      }),
    )
  })

  it('hides archived sessions and projects from all sidebar collections while keeping them in archive lists', () => {
    const sessions: SessionRecord[] = [
      {
        id: 'session-alpha',
        projectId: 'project-alpha',
        projectWorkspacePath: '/tmp/project-alpha',
        projectDisplayName: null,
        parentSessionId: null,
        modelId: 'gpt-5.4',
        title: 'Alpha project work',
        status: 'active',
        transport: 'artifacts',
        createdAt: '2026-03-24T08:00:00.000Z',
        lastActivityAt: '2026-03-24T09:00:00.000Z',
        updatedAt: '2026-03-24T09:00:00.000Z',
      },
      {
        id: 'session-beta',
        projectId: 'project-beta',
        projectWorkspacePath: '/tmp/project-beta',
        projectDisplayName: null,
        parentSessionId: null,
        modelId: 'gpt-5.4',
        title: 'Beta project work',
        status: 'completed',
        transport: 'artifacts',
        createdAt: '2026-03-24T10:00:00.000Z',
        lastActivityAt: '2026-03-24T11:00:00.000Z',
        updatedAt: '2026-03-24T11:00:00.000Z',
      },
    ]
    const store = new SessionStore()

    store.hydrateSessions(sessions)
    store.togglePinnedSession('session-alpha')
    store.archiveSession('session-alpha')
    store.archiveProject('project-beta')

    expect(store.projectGroups).toEqual([])
    expect(store.pinnedSessions).toEqual([])
    expect(store.archivedSessions.map((session) => session.id)).toEqual(['session-alpha'])
    expect(store.archivedProjects.map((group) => group.key)).toEqual(['project-beta'])
  })

  it('filters untouched sessions with no user message out of sidebar groups and pinned sessions', () => {
    const sessions: SessionRecord[] = [
      {
        id: 'session-untouched',
        projectId: 'project-alpha',
        projectWorkspacePath: '/tmp/project-alpha',
        projectDisplayName: null,
        parentSessionId: null,
        modelId: 'gpt-5.4',
        title: 'Untouched draft',
        status: 'idle',
        transport: 'artifacts',
        createdAt: '2026-03-24T08:00:00.000Z',
        lastActivityAt: '2026-03-24T08:00:00.000Z',
        updatedAt: '2026-03-24T08:00:00.000Z',
        hasUserMessage: false,
      },
      {
        id: 'session-touched',
        projectId: 'project-alpha',
        projectWorkspacePath: '/tmp/project-alpha',
        projectDisplayName: null,
        parentSessionId: null,
        modelId: 'gpt-5.4',
        title: 'Touched session',
        status: 'completed',
        transport: 'artifacts',
        createdAt: '2026-03-24T09:00:00.000Z',
        lastActivityAt: '2026-03-24T10:00:00.000Z',
        updatedAt: '2026-03-24T10:00:00.000Z',
        hasUserMessage: true,
      },
    ]
    const store = new SessionStore()

    store.hydrateSessions(sessions)
    store.togglePinnedSession('session-untouched')
    store.togglePinnedSession('session-touched')

    expect(store.projectGroups).toHaveLength(1)
    expect(store.projectGroups[0]?.sessions.map((session) => session.id)).toEqual([
      'session-touched',
    ])
    expect(store.pinnedSessions.map((session) => session.id)).toEqual(['session-touched'])
  })

  it('keeps compact-derived sessions visible in sidebar groups and pinned sessions before a new user message', () => {
    const sessions: SessionRecord[] = [
      {
        id: 'session-compact-derived',
        projectId: 'project-alpha',
        projectWorkspacePath: '/tmp/project-alpha',
        projectDisplayName: null,
        parentSessionId: 'session-parent',
        derivationType: 'compact',
        modelId: 'gpt-5.4',
        title: 'Compacted session',
        status: 'idle',
        transport: 'stream-jsonrpc',
        createdAt: '2026-03-24T08:00:00.000Z',
        lastActivityAt: '2026-03-24T08:05:00.000Z',
        updatedAt: '2026-03-24T08:05:00.000Z',
        hasUserMessage: false,
      },
    ]
    const store = new SessionStore()

    store.hydrateSessions(sessions)
    store.togglePinnedSession('session-compact-derived')

    expect(store.projectGroups).toHaveLength(1)
    expect(store.projectGroups[0]?.sessions.map((session) => session.id)).toEqual([
      'session-compact-derived',
    ])
    expect(store.pinnedSessions.map((session) => session.id)).toEqual(['session-compact-derived'])
  })

  it('keeps the current session array when ids and updatedAt values are unchanged', () => {
    const sessions = [
      {
        id: 'session-alpha',
        projectId: 'project-alpha',
        projectWorkspacePath: '/tmp/project-alpha',
        projectDisplayName: null,
        title: 'Alpha project work',
        status: 'active',
        transport: 'artifacts',
        createdAt: '2026-03-24T08:00:00.000Z',
        lastActivityAt: '2026-03-24T09:00:00.000Z',
        updatedAt: '2026-03-24T09:00:00.000Z',
      },
      {
        id: 'session-beta',
        projectId: 'project-beta',
        projectWorkspacePath: '/tmp/project-beta',
        projectDisplayName: null,
        title: 'Beta project work',
        status: 'waiting',
        transport: 'artifacts',
        createdAt: '2026-03-24T10:00:00.000Z',
        lastActivityAt: '2026-03-24T11:00:00.000Z',
        updatedAt: '2026-03-24T11:00:00.000Z',
      },
    ]

    const store = new SessionStore()

    store.hydrateSessions(sessions)
    const initialSessionsReference = store.sessions

    store.hydrateSessions(
      sessions.map((session) => ({
        ...session,
      })),
    )

    expect(store.sessions).toBe(initialSessionsReference)
  })

  it('keeps per-session observable nodes current for row-level rendering', () => {
    const sessions: SessionRecord[] = [
      {
        id: 'session-alpha',
        projectId: 'project-alpha',
        projectWorkspacePath: '/tmp/project-alpha',
        projectDisplayName: null,
        title: 'Alpha project work',
        status: 'active',
        transport: 'artifacts',
        createdAt: '2026-03-24T08:00:00.000Z',
        lastActivityAt: '2026-03-24T09:00:00.000Z',
        updatedAt: '2026-03-24T09:00:00.000Z',
      },
    ]
    const store = new SessionStore()

    store.hydrateSessions(sessions)
    const sessionNode = store.session$('session-alpha')

    store.hydrateSessions([
      {
        ...sessions[0],
        title: 'Alpha project renamed',
        status: 'waiting',
        updatedAt: '2026-03-24T10:00:00.000Z',
        lastActivityAt: '2026-03-24T10:00:00.000Z',
      },
    ])

    expect(store.session$('session-alpha')).toBe(sessionNode)
    expect(sessionNode.title.get()).toBe('Alpha project renamed')
    expect(sessionNode.status.get()).toBe('waiting')
  })

  it('applies incremental session changes without rehydrating the full list', () => {
    const initialSessions: SessionRecord[] = [
      {
        id: 'session-alpha',
        projectId: 'project-alpha',
        projectWorkspacePath: '/tmp/project-alpha',
        projectDisplayName: null,
        parentSessionId: null,
        modelId: 'gpt-5.4',
        title: 'Alpha project work',
        status: 'active',
        transport: 'artifacts',
        createdAt: '2026-03-24T08:00:00.000Z',
        lastActivityAt: '2026-03-24T09:00:00.000Z',
        updatedAt: '2026-03-24T09:00:00.000Z',
      },
      {
        id: 'session-beta',
        projectId: 'project-beta',
        projectWorkspacePath: '/tmp/project-beta',
        projectDisplayName: null,
        parentSessionId: null,
        modelId: 'gpt-5.4',
        title: 'Beta project work',
        status: 'waiting',
        transport: 'artifacts',
        createdAt: '2026-03-24T10:00:00.000Z',
        lastActivityAt: '2026-03-24T11:00:00.000Z',
        updatedAt: '2026-03-24T11:00:00.000Z',
      },
    ]
    const store = new SessionStore()

    store.hydrateSessions(initialSessions)
    store.selectSession('session-alpha')

    const delta: FoundationRecordDelta<SessionRecord> = {
      upserted: [
        {
          ...initialSessions[0],
          title: 'Alpha project work renamed',
          updatedAt: '2026-03-24T12:30:00.000Z',
          lastActivityAt: '2026-03-24T12:30:00.000Z',
        },
        {
          id: 'session-gamma',
          projectId: 'project-gamma',
          projectWorkspacePath: '/tmp/project-gamma',
          projectDisplayName: null,
          parentSessionId: null,
          modelId: 'claude-opus-4-6',
          title: 'Gamma project work',
          status: 'active',
          transport: 'artifacts',
          createdAt: '2026-03-24T12:00:00.000Z',
          lastActivityAt: '2026-03-24T12:45:00.000Z',
          updatedAt: '2026-03-24T12:45:00.000Z',
        },
      ],
      removedIds: ['session-beta'],
    }

    store.applySessionChanges(delta)

    expect(store.sessions.map((session) => session.id)).toEqual(['session-gamma', 'session-alpha'])
    expect(store.sessions.find((session) => session.id === 'session-alpha')?.title).toBe(
      'Alpha project work renamed',
    )
    expect(store.selectedSessionId).toBe('session-alpha')
  })

  it('applies session events through the store event bus', () => {
    const bus = createStoreEventBus()
    const store = new SessionStore()
    const disconnect = store.connectToEventBus(bus)

    bus.emit('session-upsert', {
      record: {
        id: 'session-alpha',
        projectId: 'project-alpha',
        projectWorkspacePath: '/tmp/project-alpha',
        projectDisplayName: null,
        parentSessionId: null,
        modelId: 'gpt-5.4',
        title: 'Bus session',
        status: 'active',
        transport: 'artifacts',
        createdAt: '2026-03-24T08:00:00.000Z',
        lastActivityAt: '2026-03-24T09:00:00.000Z',
        updatedAt: '2026-03-24T09:00:00.000Z',
      },
    })

    expect(store.sessions[0]?.title).toBe('Bus session')

    disconnect()
  })
})
