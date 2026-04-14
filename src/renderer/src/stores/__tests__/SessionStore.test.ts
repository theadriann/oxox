// @vitest-environment jsdom

import { beforeEach, describe, expect, it } from 'vitest'

import type { FoundationRecordDelta, SessionRecord } from '../../../../shared/ipc/contracts'
import { createMemoryPersistencePort } from '../../platform/persistence'

import { SessionStore } from '../SessionStore'
import { createStoreEventBus } from '../storeEventBus'

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
