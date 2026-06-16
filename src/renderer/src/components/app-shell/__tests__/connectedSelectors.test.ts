import { describe, expect, it, vi } from 'vitest'

import { createMemoryPersistencePort } from '../../../platform/persistence'
import type { ProjectSessionGroup, SessionPreview } from '../../../state/sessions/session.model'
import { UIStore } from '../../../state/ui/ui.model'
import {
  buildAppShellContextPanelState,
  buildAppShellSidebarProps,
  buildDetailPanelConnectedProps,
  buildStatusBarProps,
  buildUpdatePromptProps,
} from '../connectedSelectors'

describe('app-shell connected selectors', () => {
  it('builds detail-panel props from renderer stores and external handlers', () => {
    const refresh = vi.fn()
    const pickDirectory = vi.fn()
    const openSession = vi.fn()
    const resolvePermission = vi.fn()
    const resolveAskUser = vi.fn()

    const props = buildDetailPanelConnectedProps({
      composerStore: {
        permissionResolution: {
          pendingAskUserRequestIds: ['ask-1'],
          pendingPermissionRequestIds: ['perm-1'],
          resolveAskUser,
          resolvePermission,
        },
      } as never,
      foundationStore: {
        foundation: { daemon: {}, droidCli: {} },
        hasError: false,
        isDroidMissing: false,
        isLoading: false,
        refresh,
      } as never,
      liveSessionStore: {
        selectedSnapshot: { sessionId: 'live-1' },
        selectedTimelineItems: [],
      } as never,
      newSessionForm: {
        error: 'bad path',
        path: '/tmp/project',
        pickDirectory,
        showForm: true,
      },
      onBrowseSessions: vi.fn(),
      sessionStore: {
        hasDeletedSelection: false,
        selectedSession: { id: 'session-1' },
        selectedSessionId: 'session-1',
        sessions: [{ id: 'session-1' }],
      } as never,
      transcriptPrimaryActionRef: { current: null },
      transcriptSearchTarget: {
        sessionId: 'session-1',
        sourceId: 'message-1:0',
        sourceKind: 'block',
        messageId: 'message-1',
      },
      transcriptScrollSignal: 7,
      transcriptStore: {
        isRefreshingSession: vi.fn().mockReturnValue(true),
        openSession,
        refreshErrorForSession: vi.fn().mockReturnValue('load failed'),
        transcriptForSession: vi.fn().mockReturnValue({
          sessionId: 'session-1',
          entries: [
            {
              kind: 'message',
              id: 'message-1:0',
              sourceMessageId: 'message-1',
              role: 'assistant',
              markdown: 'Recovered output',
              occurredAt: '2026-04-09T00:00:00.000Z',
              contentBlocks: [{ type: 'text', text: 'Recovered output' }],
            },
          ],
        }),
      } as never,
      transportStore: {
        protocol: 'artifacts',
      } as never,
    })

    expect(props.showNewSessionForm).toBe(true)
    expect(props.newSessionPath).toBe('/tmp/project')
    expect(props.newSessionError).toBe('bad path')
    expect(props.isRefreshingTranscript).toBe(true)
    expect(props.selectedTranscriptRefreshError).toBe('load failed')
    expect(props.selectedLiveTimeline).toEqual([])
    expect(props.transcriptSearchTarget?.messageId).toBe('message-1')

    props.onPickDirectory()
    props.onRefreshFoundation()
    props.onRetrySelectedTranscript()
    props.onResolvePermissionRequest({ requestId: 'perm-1', selectedOption: 'allow' })
    props.onSubmitAskUserResponse({
      requestId: 'ask-1',
      answers: [{ index: 0, question: 'Continue?', answer: 'yes' }],
    })

    expect(pickDirectory).toHaveBeenCalledTimes(1)
    expect(refresh).toHaveBeenCalledTimes(1)
    expect(openSession).toHaveBeenCalledWith('session-1')
    expect(resolvePermission).toHaveBeenCalledWith('perm-1', 'allow')
    expect(resolveAskUser).toHaveBeenCalledWith('ask-1', [
      { index: 0, question: 'Continue?', answer: 'yes' },
    ])
  })

  it('builds sidebar, context-panel visibility, update prompt, and status-bar props from stores', () => {
    const isProjectCollapsed = vi.fn().mockReturnValue(false)
    const sidebarProps = buildAppShellSidebarProps({
      errorState: undefined,
      foundationStore: {
        isLoading: true,
      } as never,
      onCompactSession: vi.fn(),
      onNewSession: vi.fn(),
      onResizeStart: vi.fn(),
      prefersReducedMotion: false,
      sessionStore: {
        activeCount: 2,
        pinnedSessions: [{ id: 'pinned-1' }],
        projectGroups: [
          {
            key: 'project-1',
            label: 'Project',
            workspacePath: null,
            latestActivityAt: 0,
            sessions: [],
          },
        ],
        selectedSessionId: 'session-1',
        sessionFolders: [],
        sessionFolderAssignments: {},
        createSessionFolder: vi.fn(),
        renameSessionFolder: vi.fn(),
        deleteSessionFolder: vi.fn(),
        moveSessionToFolder: vi.fn(),
        moveSessionToProject: vi.fn(),
        moveFolder: vi.fn(),
        selectSession: vi.fn(),
        setProjectDisplayName: vi.fn(),
        togglePinnedSession: vi.fn(),
      } as never,
      shouldAnimate: true,
      uiStore: {
        ...createUIStore({
          isSidebarHidden: true,
        }),
        isProjectCollapsed,
        toggleProjectCollapsed: vi.fn(),
      } as never,
    })

    expect(sidebarProps.isHidden).toBe(true)
    expect(sidebarProps.sidebar.activeCount).toBe(2)
    expect(sidebarProps.sidebar.isLoading).toBe(true)
    expect(sidebarProps.sidebar.onCompactSession).toBeTypeOf('function')
    expect(sidebarProps.sidebar.onCreateFolder).toBeTypeOf('function')
    expect(sidebarProps.sidebar.isProjectCollapsed('project-1')).toBe(false)
    expect(isProjectCollapsed).toHaveBeenCalledWith('project-1')

    const contextPanelState = buildAppShellContextPanelState({
      isContextPanelHidden: false,
      prefersReducedMotion: true,
      shouldAnimate: false,
    })

    expect(contextPanelState).toEqual({
      isHidden: false,
      prefersReducedMotion: true,
      shouldAnimate: false,
    })

    const statusProps = buildStatusBarProps({
      foundationStore: {
        foundation: {
          daemon: {
            connectedPort: 8080,
            lastSyncAt: '2026-04-02T00:00:00.000Z',
            nextRetryDelayMs: null,
            status: 'connected',
          },
          droidCli: {
            version: '0.84.0',
          },
        },
      } as never,
      updateStore: {
        statusLabel: 'Update ready',
      } as never,
      sessionStore: {
        activeCount: 3,
      } as never,
    })

    expect(statusProps).toEqual({
      activeSessionCount: 3,
      connectedPort: 8080,
      daemonStatus: 'connected',
      droidCliVersion: '0.84.0',
      lastSyncAt: '2026-04-02T00:00:00.000Z',
      nextRetryDelayMs: null,
      updateStatusLabel: 'Update ready',
    })

    const restartNow = vi.fn()
    const dismiss = vi.fn()
    const promptProps = buildUpdatePromptProps({
      updateStore: {
        downloadedVersion: '0.0.5',
        installUpdate: restartNow,
        dismissPrompt: dismiss,
        shouldShowPrompt: true,
      } as never,
    })

    expect(promptProps?.downloadedVersion).toBe('0.0.5')
    expect(promptProps?.onDismiss).toBe(dismiss)
    promptProps?.onRestart()
    expect(restartNow).toHaveBeenCalledTimes(1)

    expect(
      buildUpdatePromptProps({
        updateStore: {
          downloadedVersion: '0.0.5',
          installUpdate: restartNow,
          dismissPrompt: dismiss,
          shouldShowPrompt: false,
        } as never,
      }),
    ).toBeNull()
  })

  it('filters child sessions from sidebar groups based on the UI visibility preference', () => {
    const uiStore = createUIStore({})
    const parent = createSessionPreview({ id: 'parent', title: 'Parent' })
    const child = createSessionPreview({
      id: 'child',
      parentSessionId: 'parent',
      derivationType: 'subagent',
      title: 'Child',
    })
    const unrelatedParent = createSessionPreview({ id: 'other-parent', title: 'Other parent' })
    const unrelatedChild = createSessionPreview({
      id: 'other-child',
      parentSessionId: 'other-parent',
      derivationType: 'subagent',
      title: 'Other child',
    })
    const fork = createSessionPreview({
      id: 'fork',
      parentSessionId: 'parent',
      derivationType: 'fork',
      title: 'Fork',
    })
    const group: ProjectSessionGroup = {
      key: 'project-1',
      label: 'Project',
      workspacePath: '/tmp/project',
      latestActivityAt: 5,
      sessions: [parent, child, unrelatedParent, unrelatedChild, fork],
    }
    const baseOptions = {
      errorState: undefined,
      foundationStore: { isLoading: false } as never,
      onCompactSession: vi.fn(),
      onCopySessionId: vi.fn(),
      onForkSession: vi.fn(),
      onNewSession: vi.fn(),
      onRenameSession: vi.fn(),
      onResizeStart: vi.fn(),
      onRewindSession: vi.fn(),
      prefersReducedMotion: false,
      sessionStore: {
        activeCount: 0,
        pinnedSessions: [child],
        projectGroups: [group],
        selectedSessionId: 'parent',
        sessionFolders: [],
        sessionFolderAssignments: {},
        createSessionFolder: vi.fn(),
        renameSessionFolder: vi.fn(),
        deleteSessionFolder: vi.fn(),
        moveSessionToFolder: vi.fn(),
        moveSessionToProject: vi.fn(),
        moveFolder: vi.fn(),
        selectSession: vi.fn(),
        setProjectDisplayName: vi.fn(),
        togglePinnedSession: vi.fn(),
        sessionsById$: {} as never,
      },
      shouldAnimate: true,
      uiStore,
    }

    let props = buildAppShellSidebarProps(baseOptions)

    expect(props.sidebar.groups[0]?.sessions.map((session) => session.id)).toEqual([
      'parent',
      'child',
      'other-parent',
      'fork',
    ])
    expect(props.sidebar.pinnedSessions).toEqual([])

    uiStore.setChildSessionVisibilityMode('never')
    props = buildAppShellSidebarProps(baseOptions)

    expect(props.sidebar.groups[0]?.sessions.map((session) => session.id)).toEqual([
      'parent',
      'other-parent',
      'fork',
    ])
    expect(props.sidebar.pinnedSessions).toEqual([])

    uiStore.setChildSessionVisibilityMode('always')
    props = buildAppShellSidebarProps(baseOptions)

    expect(props.sidebar.groups[0]?.sessions.map((session) => session.id)).toEqual([
      'parent',
      'child',
      'other-parent',
      'other-child',
      'fork',
    ])
  })
})

function createSessionPreview({
  id,
  title,
  parentSessionId = null,
  derivationType = null,
}: {
  id: string
  title: string
  parentSessionId?: string | null
  derivationType?: string | null
}): SessionPreview {
  return {
    id,
    title,
    projectKey: 'project-1',
    projectLabel: 'Project',
    defaultProjectLabel: 'Project',
    projectWorkspacePath: '/tmp/project',
    modelId: null,
    parentSessionId,
    derivationType,
    hasUserMessage: true,
    status: 'idle',
    transport: 'artifacts',
    transportLocation: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    lastActivityAt: '2026-01-01T00:00:00.000Z',
    lastActivityTimestamp: Number(id.length),
  }
}

function createUIStore({
  isSidebarHidden = false,
  sidebarWidth = 256,
}: {
  isSidebarHidden?: boolean
  sidebarWidth?: number
}): UIStore {
  const uiStore = new UIStore(createMemoryPersistencePort())
  uiStore.state$.isSidebarHidden.set(isSidebarHidden)
  uiStore.state$.sidebarWidth.set(sidebarWidth)
  return uiStore
}
