import { useValue } from '@legendapp/state/react'
import { AnimatePresence, motion } from 'framer-motion'
import { useCallback } from 'react'

import { createPanelVariants } from '../../lib/motion'
import {
  useComposerStore,
  useFoundationStore,
  useLiveSessionStore,
  useRootStore,
  useSessionStore,
  useUIStore,
} from '../../state/root/store-provider'
import { showAppNotification } from '../notifications/notificationCenter'
import { SettingsSidebar } from '../settings/SettingsSidebar'
import { SessionSidebarConnected } from '../sidebar/SessionSidebarConnected'
import { useAppShellControllerContext } from './AppShellControllerContext'
import { buildAppShellSidebarProps } from './connectedSelectors'
import { useAppShellViewModel } from './useAppShellViewModel'

interface AppShellSidebarProps {
  prefersReducedMotion: boolean
  shouldAnimate: boolean
}

export function AppShellSidebar({ prefersReducedMotion, shouldAnimate }: AppShellSidebarProps) {
  const composerStore = useComposerStore()
  const foundationStore = useFoundationStore()
  const liveSessionStore = useLiveSessionStore()
  const rootStore = useRootStore()
  const sessionStore = useSessionStore()
  const uiStore = useUIStore()
  const { newSessionForm, startSidebarResize } = useAppShellControllerContext()
  const { sidebarErrorState } = useAppShellViewModel({
    foundationStore,
    liveSessionStore,
    newSessionForm,
    prefersReducedMotion,
    sessionStore,
  })
  const isSettingsView = useValue(() => uiStore.isSettingsOpen())
  const settingsSection = useValue(uiStore.state$.settingsSection)

  const handleCopySessionId = useCallback(
    (sessionId: string) => {
      sessionStore.selectSession(sessionId)
      composerStore.copySelectedId()
    },
    [composerStore, sessionStore],
  )

  const handleForkSession = useCallback(
    (sessionId: string) => {
      sessionStore.selectSession(sessionId)
      composerStore.forkWorkflow.openForkDialog()
    },
    [composerStore, sessionStore],
  )

  const handleCompactSession = useCallback(
    (sessionId: string) => {
      sessionStore.selectSession(sessionId)
      void composerStore.compactSelected()
    },
    [composerStore, sessionStore],
  )

  const handleRenameSession = useCallback(
    (sessionId: string) => {
      sessionStore.selectSession(sessionId)
      composerStore.renameWorkflow.openRenameDialog()
    },
    [composerStore, sessionStore],
  )

  const handleRewindSession = useCallback(
    (sessionId: string) => {
      sessionStore.selectSession(sessionId)
      composerStore.rewindWorkflow.openRewindDialog()
    },
    [composerStore, sessionStore],
  )

  const handleDeleteSession = useCallback(
    (sessionId: string) => {
      const title = sessionStore.sessionsById[sessionId]?.title ?? 'this session'
      const confirmed = window.confirm(
        `Delete "${title}" permanently?\n\nThis removes the local Droid transcript files and OXOX indexes. This cannot be undone.`,
      )

      if (!confirmed) {
        return
      }

      const deleteSession = rootStore.api.session.deleteSession
      if (!deleteSession) {
        showAppNotification({
          id: `session-delete-unavailable-${sessionId}`,
          kind: 'error',
          title: 'Delete unavailable',
          description: 'This OXOX build does not expose session deletion.',
        })
        return
      }

      void deleteSession(sessionId)
        .then(() => {
          sessionStore.deleteSessionLocally(sessionId)
          showAppNotification({
            id: `session-delete-success-${sessionId}`,
            kind: 'success',
            title: 'Session deleted',
            description: `Deleted "${title}".`,
          })
        })
        .catch((error) => {
          showAppNotification({
            id: `session-delete-failed-${sessionId}-${Date.now()}`,
            kind: 'error',
            title: 'Delete failed',
            description: error instanceof Error ? error.message : String(error),
          })
        })
    },
    [rootStore.api.session.deleteSession, sessionStore],
  )

  const sidebarState = useValue(() =>
    buildAppShellSidebarProps({
      errorState: sidebarErrorState,
      foundationStore,
      onCompactSession: handleCompactSession,
      onCopySessionId: handleCopySessionId,
      onDeleteSession: handleDeleteSession,
      onForkSession: handleForkSession,
      onNewSession: newSessionForm.openDraft,
      onRenameSession: handleRenameSession,
      onResizeStart: startSidebarResize,
      onRewindSession: handleRewindSession,
      prefersReducedMotion,
      sessionStore,
      shouldAnimate,
      uiStore,
    }),
  )

  const sidebar = isSettingsView ? (
    <SettingsSidebar
      activeSection={settingsSection}
      onSelectSection={uiStore.setSettingsSection}
      onBack={uiStore.closeSettings}
    />
  ) : (
    <SessionSidebarConnected
      {...sidebarState.sidebar}
      searchSessions={rootStore.api.search.sessions}
    />
  )

  if (!shouldAnimate) {
    return <div className="min-h-0 min-w-0">{sidebar}</div>
  }

  return (
    <AnimatePresence initial={false} mode="popLayout">
      <motion.div
        key="sidebar"
        layout
        animate="animate"
        className="min-h-0 min-w-0"
        exit="exit"
        initial="initial"
        variants={createPanelVariants(prefersReducedMotion, 'left')}
      >
        {sidebar}
      </motion.div>
    </AnimatePresence>
  )
}
