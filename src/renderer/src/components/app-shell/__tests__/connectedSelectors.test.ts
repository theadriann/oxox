import { describe, expect, it, vi } from 'vitest'

import {
  buildAppShellContextPanelState,
  buildAppShellSidebarProps,
  buildDetailPanelConnectedProps,
  buildStatusBarProps,
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
      uiStore: {
        isSidebarHidden: false,
        sidebarWidth: 320,
      } as never,
    })

    expect(props.showNewSessionForm).toBe(true)
    expect(props.newSessionPath).toBe('/tmp/project')
    expect(props.newSessionError).toBe('bad path')
    expect(props.isRefreshingTranscript).toBe(true)
    expect(props.selectedTranscriptRefreshError).toBe('load failed')
    expect(props.selectedLiveTimeline).toEqual([])

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

  it('builds sidebar, context-panel visibility, and status-bar props from stores', () => {
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
        projectGroups: [{ projectKey: 'project-1' }],
        selectedSessionId: 'session-1',
        selectSession: vi.fn(),
        setProjectDisplayName: vi.fn(),
        togglePinnedSession: vi.fn(),
      } as never,
      shouldAnimate: true,
      uiStore: {
        isProjectCollapsed: vi.fn().mockReturnValue(false),
        isSidebarHidden: true,
        toggleProjectCollapsed: vi.fn(),
      } as never,
    })

    expect(sidebarProps.isHidden).toBe(true)
    expect(sidebarProps.sidebar.activeCount).toBe(2)
    expect(sidebarProps.sidebar.isLoading).toBe(true)
    expect(sidebarProps.sidebar.onCompactSession).toBeTypeOf('function')

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
    })
  })
})
