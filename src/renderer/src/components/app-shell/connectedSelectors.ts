import type { PointerEvent as ReactPointerEvent, RefObject } from 'react'
import type { LiveSessionAskUserAnswerRecord } from '../../../../shared/ipc/contracts'

import type { SessionSidebarProps } from '../sidebar/SessionSidebar'
import type { StatusBarProps } from '../status-bar/StatusBar'
import type { DetailPanelProps } from './DetailPanel'

interface BuildDetailPanelConnectedPropsOptions {
  composerStore: {
    permissionResolution: {
      pendingAskUserRequestIds: string[]
      pendingPermissionRequestIds: string[]
      resolveAskUser: (
        requestId: string,
        answers: LiveSessionAskUserAnswerRecord[],
      ) => Promise<void> | void
      resolvePermission: (requestId: string, selectedOption: string) => Promise<void> | void
    }
  }
  foundationStore: {
    foundation: DetailPanelProps['foundation']
    hasError: boolean
    isDroidMissing: boolean
    isLoading: boolean
    refresh: () => Promise<void> | void
  }
  liveSessionStore: {
    selectedSnapshot: DetailPanelProps['selectedLiveSession']
    selectedTimelineItems: DetailPanelProps['selectedLiveTimeline']
  }
  newSessionForm: {
    showForm: boolean
    path: string
    error: string | null
    pickDirectory: () => Promise<void>
  }
  onBrowseSessions: () => void
  sessionStore: {
    hasDeletedSelection: boolean
    selectedSession: DetailPanelProps['selectedSession']
    selectedSessionId: string
    sessions: Array<unknown>
  }
  transcriptPrimaryActionRef: RefObject<HTMLElement | null>
  transcriptScrollSignal: number
  transcriptStore: {
    isRefreshingSession: (sessionId: string) => boolean
    openSession: (sessionId: string) => Promise<void>
    refreshErrorForSession: (sessionId: string) => string | null
    transcriptForSession: (sessionId: string) => DetailPanelProps['selectedTranscript']
  }
  transportStore: {
    protocol: string
  }
  uiStore: {
    isSidebarHidden: boolean
    sidebarWidth: number
  }
}

export function buildDetailPanelConnectedProps({
  composerStore,
  foundationStore,
  liveSessionStore,
  newSessionForm,
  onBrowseSessions,
  sessionStore,
  transcriptPrimaryActionRef,
  transcriptScrollSignal,
  transcriptStore,
  transportStore,
  uiStore,
}: BuildDetailPanelConnectedPropsOptions): DetailPanelProps {
  const selectedSessionId = sessionStore.selectedSessionId
  const selectedTranscript = selectedSessionId
    ? transcriptStore.transcriptForSession(selectedSessionId)
    : null

  return {
    foundation: foundationStore.foundation,
    hasDeletedSelection: sessionStore.hasDeletedSelection,
    hasFoundationError: foundationStore.hasError,
    hasIndexedSessions: sessionStore.sessions.length > 0,
    isDroidMissing: foundationStore.isDroidMissing,
    isFoundationLoading: foundationStore.isLoading,
    isRefreshingTranscript: selectedSessionId
      ? transcriptStore.isRefreshingSession(selectedSessionId)
      : false,
    isSidebarHidden: uiStore.isSidebarHidden,
    newSessionError: newSessionForm.error,
    newSessionPath: newSessionForm.path,
    onBrowseSessions,
    onPickDirectory: () => void newSessionForm.pickDirectory(),
    onRefreshFoundation: () => void foundationStore.refresh(),
    onResolvePermissionRequest: (payload) =>
      void composerStore.permissionResolution.resolvePermission(
        payload.requestId,
        payload.selectedOption,
      ),
    onRetrySelectedTranscript: () => {
      if (!selectedSessionId) {
        return
      }

      void transcriptStore.openSession(selectedSessionId)
    },
    onSubmitAskUserResponse: (payload) =>
      void composerStore.permissionResolution.resolveAskUser(payload.requestId, payload.answers),
    pendingAskUserRequestIds: composerStore.permissionResolution.pendingAskUserRequestIds,
    pendingPermissionRequestIds: composerStore.permissionResolution.pendingPermissionRequestIds,
    selectedLiveSession: liveSessionStore.selectedSnapshot,
    selectedLiveTimeline: liveSessionStore.selectedTimelineItems,
    selectedSession: sessionStore.selectedSession,
    selectedTranscript,
    selectedTranscriptRefreshError: selectedSessionId
      ? transcriptStore.refreshErrorForSession(selectedSessionId)
      : null,
    showNewSessionForm: newSessionForm.showForm,
    sidebarWidth: uiStore.sidebarWidth,
    transcriptPrimaryActionRef,
    transcriptScrollSignal,
    transportProtocol: transportStore.protocol,
  }
}

interface BuildAppShellSidebarPropsOptions {
  errorState: SessionSidebarProps['errorState']
  foundationStore: {
    isLoading: boolean
  }
  onCompactSession: (sessionId: string) => void
  onCopySessionId: (sessionId: string) => void
  onForkSession: (sessionId: string) => void
  onNewSession: (workspacePath?: string) => void
  onRenameSession: (sessionId: string) => void
  onResizeStart: (event: ReactPointerEvent<HTMLDivElement>) => void
  onRewindSession: (sessionId: string) => void
  prefersReducedMotion: boolean
  sessionStore: {
    activeCount: number
    pinnedSessions: SessionSidebarProps['pinnedSessions']
    projectGroups: SessionSidebarProps['groups']
    selectedSessionId: string
    selectSession: SessionSidebarProps['onSelectSession']
    setProjectDisplayName: SessionSidebarProps['onSetProjectDisplayName']
    togglePinnedSession: SessionSidebarProps['onTogglePinnedSession']
  }
  shouldAnimate: boolean
  uiStore: {
    isProjectCollapsed: SessionSidebarProps['isProjectCollapsed']
    isSidebarHidden: boolean
    toggleProjectCollapsed: SessionSidebarProps['onToggleProject']
    toggleSidebar: () => void
  }
}

export function buildAppShellSidebarProps({
  errorState,
  foundationStore,
  onCompactSession,
  onCopySessionId,
  onForkSession,
  onNewSession,
  onRenameSession,
  onResizeStart,
  onRewindSession,
  prefersReducedMotion,
  sessionStore,
  shouldAnimate,
  uiStore,
}: BuildAppShellSidebarPropsOptions) {
  return {
    isHidden: uiStore.isSidebarHidden,
    prefersReducedMotion,
    shouldAnimate,
    sidebar: {
      activeCount: sessionStore.activeCount,
      errorState,
      groups: sessionStore.projectGroups,
      isLoading: foundationStore.isLoading,
      isProjectCollapsed: uiStore.isProjectCollapsed,
      onNewSession,
      onResizeStart,
      onSelectSession: sessionStore.selectSession,
      onSetProjectDisplayName: sessionStore.setProjectDisplayName,
      onArchiveProject: sessionStore.archiveProject,
      onArchiveSession: sessionStore.archiveSession,
      onCompactSession,
      onCopySessionId,
      onForkSession,
      onRenameSession,
      onRewindSession,
      onTogglePinnedSession: sessionStore.togglePinnedSession,
      onToggleProject: uiStore.toggleProjectCollapsed,
      onHideSidebar: uiStore.toggleSidebar,
      pinnedSessions: sessionStore.pinnedSessions,
      selectedSessionId: sessionStore.selectedSessionId,
    } satisfies SessionSidebarProps,
  }
}

export function buildAppShellContextPanelState({
  isContextPanelHidden,
  prefersReducedMotion,
  shouldAnimate,
}: {
  isContextPanelHidden: boolean
  prefersReducedMotion: boolean
  shouldAnimate: boolean
}) {
  return {
    isHidden: isContextPanelHidden,
    prefersReducedMotion,
    shouldAnimate,
  }
}

export function buildStatusBarProps({
  foundationStore,
  sessionStore,
}: {
  foundationStore: {
    foundation: {
      daemon: {
        connectedPort: number | null
        lastSyncAt: string | null
        nextRetryDelayMs: number | null
        status: StatusBarProps['daemonStatus']
      }
      droidCli: {
        version: string | null
      }
    }
  }
  sessionStore: {
    activeCount: number
  }
}): StatusBarProps {
  return {
    activeSessionCount: sessionStore.activeCount,
    connectedPort: foundationStore.foundation.daemon.connectedPort,
    daemonStatus: foundationStore.foundation.daemon.status,
    droidCliVersion: foundationStore.foundation.droidCli.version,
    lastSyncAt: foundationStore.foundation.daemon.lastSyncAt,
    nextRetryDelayMs: foundationStore.foundation.daemon.nextRetryDelayMs,
  }
}
