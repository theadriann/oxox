// @vitest-environment jsdom

import { observable } from '@legendapp/state'
import { act, fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import type { SessionPreview } from '../../../state/sessions/session.model'
import { TooltipProvider } from '../../ui/tooltip'
import { buildFlatItems, SessionList, type VirtualSidebarItem } from '../SessionList'
import { SessionSidebarStore } from '../SessionSidebarStore'

function createSession(sessionId = 'session-alpha'): SessionPreview {
  return {
    id: sessionId,
    title: 'Alpha',
    projectKey: 'project-alpha',
    projectLabel: 'project-alpha',
    projectWorkspacePath: '/tmp/project-alpha',
    modelId: 'gpt-5.4',
    parentSessionId: null,
    derivationType: null,
    hasUserMessage: true,
    status: 'active',
    createdAt: '2026-03-24T23:30:00.000Z',
    updatedAt: '2026-03-24T23:40:00.000Z',
    lastActivityAt: '2026-03-24T23:40:00.000Z',
    lastActivityTimestamp: Date.parse('2026-03-24T23:40:00.000Z'),
  }
}

describe('SessionList', () => {
  it('renders project and session items through the virtual list shell', () => {
    const store = new SessionSidebarStore()
    const sessionRefs = new Map<string, HTMLButtonElement>()
    const scrollAreaRef = { current: document.createElement('div') }
    const sessionsById$ = observable<Record<string, SessionPreview>>({
      'session-alpha': createSession(),
    })
    const flatItems: VirtualSidebarItem[] = [
      {
        kind: 'project-header',
        projectKey: 'project-alpha',
        label: 'project-alpha',
        workspacePath: '/tmp/project-alpha',
        sessionCount: 1,
        collapsed: false,
      },
      {
        kind: 'session',
        focusKey: 'project:project-alpha:session-alpha',
        sessionId: 'session-alpha',
        isPinned: false,
      },
    ]

    render(
      <TooltipProvider>
        <SessionList
          flatItems={flatItems}
          sessionsById$={sessionsById$}
          focusedKey="project:project-alpha:session-alpha"
          selectedSessionId="session-alpha"
          store={store}
          sessionRefs={sessionRefs}
          scrollAreaRef={scrollAreaRef}
          onToggleProject={vi.fn()}
          onToggleFolder={vi.fn()}
          onNewSession={vi.fn()}
          onSelectSession={vi.fn()}
          onTogglePinnedSession={vi.fn()}
          onSessionKeyDown={vi.fn()}
          onFocus={vi.fn()}
        />
      </TooltipProvider>,
    )

    expect(screen.getByText('project-alpha')).toBeTruthy()
    expect(screen.getByTitle('Alpha')).toBeTruthy()

    act(() => {
      sessionsById$['session-alpha'].title.set('Renamed alpha')
    })

    expect(screen.getByTitle('Renamed alpha')).toBeTruthy()
  })

  it('builds a VSCode-like folder tree with folders before loose sessions', () => {
    const store = new SessionSidebarStore()
    const sessions = [
      createSession('session-new'),
      {
        ...createSession('session-foldered'),
        title: 'Foldered',
        lastActivityTimestamp: Date.parse('2026-03-24T23:30:00.000Z'),
      },
      {
        ...createSession('session-child'),
        title: 'Child',
        parentSessionId: 'session-foldered',
        derivationType: 'subagent',
      },
      {
        ...createSession('session-old'),
        title: 'Old',
        lastActivityTimestamp: Date.parse('2026-03-24T22:30:00.000Z'),
      },
    ]

    const flatItems = buildFlatItems({
      pinnedSessions: [],
      groups: [
        {
          key: 'project-alpha',
          label: 'project-alpha',
          workspacePath: '/tmp/project-alpha',
          latestActivityAt: sessions[0]?.lastActivityTimestamp ?? 0,
          sessions,
        },
      ],
      sessionFolders: [
        {
          id: 'folder-feature',
          projectKey: 'project-alpha',
          name: 'Feature',
          parentFolderId: null,
          createdAt: '2026-03-24T00:00:00.000Z',
          updatedAt: '2026-03-24T00:00:00.000Z',
          order: 0,
        },
      ],
      sessionFolderAssignments: {
        'session-foldered': 'folder-feature',
      },
      isFiltering: false,
      isLoading: false,
      hasError: false,
      editingProjectKey: null,
      editingFolderId: null,
      isProjectCollapsed: () => false,
      isFolderCollapsed: () => false,
      store,
    })

    expect(
      flatItems.map((item) =>
        item.kind === 'session'
          ? item.sessionId
          : item.kind === 'folder-header'
            ? item.name
            : item.kind,
      ),
    ).toEqual([
      'project-header',
      'Feature',
      'session-foldered',
      'session-child',
      'session-new',
      'session-old',
    ])
  })

  it('includes folder-assigned sessions beyond the project overflow limit by default', () => {
    const store = new SessionSidebarStore()
    const looseSessions = Array.from({ length: 6 }, (_, index) => ({
      ...createSession(`session-loose-${index + 1}`),
      title: `Loose ${index + 1}`,
      lastActivityTimestamp: Date.parse(`2026-03-24T23:0${5 - index}:00.000Z`),
    }))
    const folderedSession = {
      ...createSession('session-foldered'),
      title: 'Foldered beyond overflow',
      lastActivityTimestamp: Date.parse('2026-03-24T22:00:00.000Z'),
    }

    const flatItems = buildFlatItems({
      pinnedSessions: [],
      groups: [
        {
          key: 'project-alpha',
          label: 'project-alpha',
          workspacePath: '/tmp/project-alpha',
          latestActivityAt: looseSessions[0]?.lastActivityTimestamp ?? 0,
          sessions: [...looseSessions, folderedSession],
        },
      ],
      sessionFolders: [
        {
          id: 'folder-feature',
          projectKey: 'project-alpha',
          name: 'Feature',
          parentFolderId: null,
          createdAt: '2026-03-24T00:00:00.000Z',
          updatedAt: '2026-03-24T00:00:00.000Z',
          order: 0,
        },
      ],
      sessionFolderAssignments: {
        'session-foldered': 'folder-feature',
      },
      isFiltering: false,
      isLoading: false,
      hasError: false,
      editingProjectKey: null,
      editingFolderId: null,
      isProjectCollapsed: () => false,
      isFolderCollapsed: () => false,
      store,
    })

    expect(
      flatItems.map((item) =>
        item.kind === 'session'
          ? item.sessionId
          : item.kind === 'folder-header'
            ? `${item.name}:${item.sessionCount}`
            : item.kind === 'show-more'
              ? `show-more:${item.remainingCount}`
              : item.kind,
      ),
    ).toEqual([
      'project-header',
      'Feature:1',
      'session-foldered',
      'session-loose-1',
      'session-loose-2',
      'session-loose-3',
      'session-loose-4',
      'session-loose-5',
      'show-more:1',
    ])
  })
  it('hides folder descendants when a folder is collapsed', () => {
    const store = new SessionSidebarStore()
    const flatItems = buildFlatItems({
      pinnedSessions: [],
      groups: [
        {
          key: 'project-alpha',
          label: 'project-alpha',
          workspacePath: '/tmp/project-alpha',
          latestActivityAt: 1,
          sessions: [createSession('session-foldered')],
        },
      ],
      sessionFolders: [
        {
          id: 'folder-feature',
          projectKey: 'project-alpha',
          name: 'Feature',
          parentFolderId: null,
          createdAt: '2026-03-24T00:00:00.000Z',
          updatedAt: '2026-03-24T00:00:00.000Z',
          order: 0,
        },
      ],
      sessionFolderAssignments: {
        'session-foldered': 'folder-feature',
      },
      isFiltering: false,
      isLoading: false,
      hasError: false,
      editingProjectKey: null,
      editingFolderId: null,
      isProjectCollapsed: () => false,
      isFolderCollapsed: (folderId) => folderId === 'folder-feature',
      store,
    })

    expect(flatItems.some((item) => item.kind === 'session')).toBe(false)
  })

  it('moves sessions into folders through native drag and drop callbacks', () => {
    const store = new SessionSidebarStore()
    const sessionRefs = new Map<string, HTMLButtonElement>()
    const scrollAreaRef = { current: document.createElement('div') }
    const sessionsById$ = observable<Record<string, SessionPreview>>({
      'session-alpha': createSession(),
    })
    const onMoveSessionToFolder = vi.fn()
    const dataTransfer = createDataTransfer()

    render(
      <TooltipProvider>
        <SessionList
          flatItems={[
            {
              kind: 'project-header',
              projectKey: 'project-alpha',
              label: 'project-alpha',
              workspacePath: '/tmp/project-alpha',
              sessionCount: 1,
              collapsed: false,
            },
            {
              kind: 'folder-header',
              folderId: 'folder-feature',
              projectKey: 'project-alpha',
              workspacePath: '/tmp/project-alpha',
              name: 'Feature',
              depth: 0,
              collapsed: false,
              sessionCount: 0,
            },
            {
              kind: 'session',
              focusKey: 'project:project-alpha:session-alpha',
              sessionId: 'session-alpha',
              isPinned: false,
            },
          ]}
          sessionsById$={sessionsById$}
          focusedKey="project:project-alpha:session-alpha"
          selectedSessionId="session-alpha"
          store={store}
          sessionRefs={sessionRefs}
          scrollAreaRef={scrollAreaRef}
          onToggleProject={vi.fn()}
          onToggleFolder={vi.fn()}
          onNewSession={vi.fn()}
          onSelectSession={vi.fn()}
          onTogglePinnedSession={vi.fn()}
          onMoveSessionToFolder={onMoveSessionToFolder}
          onSessionKeyDown={vi.fn()}
          onFocus={vi.fn()}
        />
      </TooltipProvider>,
    )

    fireEvent.dragStart(screen.getByTitle('Alpha'), { dataTransfer })
    fireEvent.drop(screen.getByText('Feature'), { dataTransfer })

    expect(onMoveSessionToFolder).toHaveBeenCalledWith('session-alpha', 'folder-feature')
  })

  it('opens folder rename from the row menu without relying on browser prompt', async () => {
    const store = new SessionSidebarStore()
    const sessionRefs = new Map<string, HTMLButtonElement>()
    const scrollAreaRef = { current: document.createElement('div') }
    const sessionsById$ = observable<Record<string, SessionPreview>>({})
    const onRenameFolder = vi.fn()

    render(
      <TooltipProvider>
        <SessionList
          flatItems={[
            {
              kind: 'folder-header',
              folderId: 'folder-feature',
              projectKey: 'project-alpha',
              workspacePath: '/tmp/project-alpha',
              name: 'Feature',
              depth: 0,
              collapsed: false,
              sessionCount: 0,
            },
          ]}
          sessionsById$={sessionsById$}
          focusedKey={null}
          selectedSessionId=""
          store={store}
          sessionRefs={sessionRefs}
          scrollAreaRef={scrollAreaRef}
          onToggleProject={vi.fn()}
          onToggleFolder={vi.fn()}
          onNewSession={vi.fn()}
          onSelectSession={vi.fn()}
          onTogglePinnedSession={vi.fn()}
          onRenameFolder={onRenameFolder}
          onSessionKeyDown={vi.fn()}
          onFocus={vi.fn()}
        />
      </TooltipProvider>,
    )

    await userEvent.click(screen.getByRole('button', { name: /more actions for feature/i }))
    await userEvent.click(screen.getByRole('menuitem', { name: /rename folder/i }))

    expect(onRenameFolder).not.toHaveBeenCalled()
    expect(store.folderRenameFolderId).toBe('folder-feature')
    expect(store.folderRenameDraft).toBe('Feature')
  })
})

function createDataTransfer() {
  const values = new Map<string, string>()

  return {
    effectAllowed: 'all',
    getData: vi.fn((type: string) => values.get(type) ?? ''),
    setData: vi.fn((type: string, value: string) => {
      values.set(type, value)
    }),
  }
}
