import type { PointerEvent as ReactPointerEvent, RefObject } from 'react'
import type {
  LiveSessionAskUserAnswerRecord,
  SessionSearchTarget,
} from '../../../../shared/ipc/contracts'
import type { UIStore } from '../../state/ui/ui.model'
import type { ChildSessionVisibilityMode } from '../../state/ui/ui.state'

import type { SessionSidebarProps } from '../sidebar/SessionSidebar'
import type { StatusBarProps } from '../status-bar/StatusBar'
import type { DetailPanelProps } from './DetailPanel'
import type { UpdatePromptProps } from './UpdatePrompt'

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
  transcriptSearchTarget: SessionSearchTarget | null
  transcriptScrollSignal: number
  transcriptStore: {
    scrollStateForSession: (
      sessionId: string,
    ) => DetailPanelProps['transcriptScrollState'] | undefined
    isRefreshingSession: (sessionId: string) => boolean
    openSession: (sessionId: string) => Promise<void>
    refreshErrorForSession: (sessionId: string) => string | null
    transcriptForSession: (sessionId: string) => DetailPanelProps['selectedTranscript']
  }
  transportStore: {
    protocol: string
  }
  uiStore: UIStore
}

export function buildDetailPanelConnectedProps({
  composerStore,
  foundationStore,
  liveSessionStore,
  newSessionForm,
  onBrowseSessions,
  sessionStore,
  transcriptPrimaryActionRef,
  transcriptSearchTarget,
  transcriptScrollSignal,
  transcriptStore,
  transportStore,
  uiStore,
}: BuildDetailPanelConnectedPropsOptions): DetailPanelProps {
  const selectedSessionId = sessionStore.selectedSessionId
  const selectedTranscript = selectedSessionId
    ? transcriptStore.transcriptForSession(selectedSessionId)
    : null
  const transcriptScrollPersistenceEnabled = uiStore.state$.persistTranscriptScrollPerSession.get()
  const transcriptScrollState =
    selectedSessionId && transcriptScrollPersistenceEnabled
      ? transcriptStore.scrollStateForSession(selectedSessionId)
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
    onTranscriptScrollStateChange: () => undefined,
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
    transcriptPrimaryActionRef,
    transcriptSearchTarget,
    transcriptScrollPersistenceEnabled,
    transcriptScrollSignal,
    transcriptScrollState,
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
  onDeleteSession: (sessionId: string) => void
  onForkSession: (sessionId: string) => void
  onNewSession: (workspacePath?: string, folderId?: string | null) => void
  onRenameSession: (sessionId: string) => void
  onResizeStart: (event: ReactPointerEvent<HTMLDivElement>) => void
  onRewindSession: (sessionId: string) => void
  prefersReducedMotion: boolean
  sessionStore: {
    activeCount: number
    pinnedSessions: SessionSidebarProps['pinnedSessions']
    projectGroups: SessionSidebarProps['groups']
    selectedSessionId: string
    sessionFolders: NonNullable<SessionSidebarProps['sessionFolders']>
    sessionFolderAssignments: NonNullable<SessionSidebarProps['sessionFolderAssignments']>
    sessionsById$: NonNullable<SessionSidebarProps['sessionsById$']>
    selectSession: SessionSidebarProps['onSelectSession']
    createSessionFolder: NonNullable<SessionSidebarProps['onCreateFolder']>
    renameSessionFolder: NonNullable<SessionSidebarProps['onRenameFolder']>
    deleteSessionFolder: NonNullable<SessionSidebarProps['onDeleteFolder']>
    moveSessionToFolder: NonNullable<SessionSidebarProps['onMoveSessionToFolder']>
    moveSessionToProject: NonNullable<SessionSidebarProps['onMoveSessionToProject']>
    moveFolder: NonNullable<SessionSidebarProps['onMoveFolder']>
    setProjectDisplayName: SessionSidebarProps['onSetProjectDisplayName']
    togglePinnedSession: SessionSidebarProps['onTogglePinnedSession']
  }
  shouldAnimate: boolean
  uiStore: UIStore
}

export function buildAppShellSidebarProps({
  errorState,
  foundationStore,
  onCompactSession,
  onCopySessionId,
  onDeleteSession,
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
  const filteredSidebarSessions = filterChildSessionsForSidebar({
    groups: sessionStore.projectGroups,
    mode: uiStore.state$.childSessionVisibilityMode.get(),
    pinnedSessions: sessionStore.pinnedSessions,
    selectedSessionId: sessionStore.selectedSessionId,
  })

  return {
    isHidden: uiStore.state$.isSidebarHidden.get(),
    prefersReducedMotion,
    shouldAnimate,
    sidebar: {
      activeCount: sessionStore.activeCount,
      errorState,
      groups: filteredSidebarSessions.groups,
      sessionFolders: sessionStore.sessionFolders,
      sessionFolderAssignments: sessionStore.sessionFolderAssignments,
      isLoading: foundationStore.isLoading,
      isProjectCollapsed: uiStore.isProjectCollapsed,
      isFolderCollapsed: uiStore.isFolderCollapsed,
      onNewSession,
      onResizeStart,
      onSelectSession: sessionStore.selectSession,
      onCreateFolder: sessionStore.createSessionFolder,
      onRenameFolder: sessionStore.renameSessionFolder,
      onDeleteFolder: sessionStore.deleteSessionFolder,
      onMoveSessionToFolder: sessionStore.moveSessionToFolder,
      onMoveSessionToProject: sessionStore.moveSessionToProject,
      onMoveFolder: sessionStore.moveFolder,
      onSetProjectDisplayName: sessionStore.setProjectDisplayName,
      onArchiveProject: sessionStore.archiveProject,
      onArchiveSession: sessionStore.archiveSession,
      onCompactSession,
      onCopySessionId,
      onDeleteSession,
      onForkSession,
      onRenameSession,
      onRewindSession,
      onTogglePinnedSession: sessionStore.togglePinnedSession,
      onToggleProject: uiStore.toggleProjectCollapsed,
      onToggleFolder: uiStore.toggleFolderCollapsed,
      onHideSidebar: uiStore.toggleSidebar,
      pinnedSessions: filteredSidebarSessions.pinnedSessions,
      selectedSessionId: sessionStore.selectedSessionId,
      sessionsById$: sessionStore.sessionsById$,
    } satisfies SessionSidebarProps,
  }
}

function filterChildSessionsForSidebar({
  groups,
  mode,
  pinnedSessions,
  selectedSessionId,
}: {
  groups: SessionSidebarProps['groups']
  mode: ChildSessionVisibilityMode
  pinnedSessions: SessionSidebarProps['pinnedSessions']
  selectedSessionId: string
}): {
  groups: SessionSidebarProps['groups']
  pinnedSessions: SessionSidebarProps['pinnedSessions']
} {
  const visiblePinnedSessions = pinnedSessions.filter((session) => !isChildSession(session))

  if (mode === 'always') {
    return { groups, pinnedSessions: visiblePinnedSessions }
  }

  const sessions = [...groups.flatMap((group) => group.sessions), ...pinnedSessions]
  const sessionsById = new Map(sessions.map((session) => [session.id, session]))
  const selectedSession = sessionsById.get(selectedSessionId)
  const visibleParentId =
    mode === 'selected-parent' && selectedSession
      ? getVisibleChildSessionParentId(selectedSession, sessions)
      : null

  const shouldShowSession = (session: (typeof sessions)[number]): boolean => {
    if (!isChildSession(session)) {
      return true
    }

    return mode === 'selected-parent' && session.parentSessionId === visibleParentId
  }

  return {
    groups: groups
      .map((group) => {
        const visibleSessions = group.sessions.filter(shouldShowSession)

        if (visibleSessions.length === 0) {
          return null
        }

        return {
          ...group,
          latestActivityAt: Math.max(
            ...visibleSessions.map((session) => session.lastActivityTimestamp),
          ),
          sessions: visibleSessions,
        }
      })
      .filter((group): group is SessionSidebarProps['groups'][number] => Boolean(group)),
    pinnedSessions: visiblePinnedSessions.filter(shouldShowSession),
  }
}

function getVisibleChildSessionParentId(
  selectedSession: SessionSidebarProps['groups'][number]['sessions'][number],
  sessions: Array<SessionSidebarProps['groups'][number]['sessions'][number]>,
): string | null {
  if (isChildSession(selectedSession)) {
    return selectedSession.parentSessionId
  }

  return sessions.some(
    (session) => isChildSession(session) && session.parentSessionId === selectedSession.id,
  )
    ? selectedSession.id
    : null
}

function isChildSession(
  session: SessionSidebarProps['groups'][number]['sessions'][number],
): session is SessionSidebarProps['groups'][number]['sessions'][number] & {
  parentSessionId: string
} {
  return Boolean(
    session.parentSessionId && session.derivationType && session.derivationType !== 'fork',
  )
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
  updateStore,
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
  updateStore: {
    statusLabel: string | null
  }
  sessionStore: {
    activeCount: number
  }
}): StatusBarProps {
  const foundation = foundationStore.foundation
  return {
    activeSessionCount: sessionStore.activeCount,
    connectedPort: foundation.daemon.connectedPort,
    daemonStatus: foundation.daemon.status,
    droidCliVersion: foundation.droidCli.version,
    lastSyncAt: foundation.daemon.lastSyncAt,
    nextRetryDelayMs: foundation.daemon.nextRetryDelayMs,
    updateStatusLabel: updateStore.statusLabel,
  }
}

export function buildUpdatePromptProps({
  updateStore,
}: {
  updateStore: {
    downloadedVersion: string | null
    installUpdate: () => Promise<void> | void
    dismissPrompt: () => void
    shouldShowPrompt: boolean
  }
}): UpdatePromptProps | null {
  if (!updateStore.shouldShowPrompt) {
    return null
  }

  return {
    downloadedVersion: updateStore.downloadedVersion,
    onDismiss: updateStore.dismissPrompt,
    onRestart: () => void updateStore.installUpdate(),
  }
}
