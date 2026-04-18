import { AnimatePresence, motion } from 'framer-motion'
import { useCallback } from 'react'

import { createPanelVariants } from '../../lib/motion'
import { readValue, useValue } from '../../stores/legend'
import {
  useComposerStore,
  useFoundationStore,
  useLiveSessionStore,
  useSessionStore,
  useUIStore,
} from '../../stores/StoreProvider'
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
  const isSettingsView = useValue(() => readValue(uiStore.isSettingsOpen))
  const settingsSection = useValue(() => readValue(uiStore.settingsSection))

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
      void composerStore.forkSelected()
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

  const sidebarState = useValue(() =>
    buildAppShellSidebarProps({
      errorState: sidebarErrorState,
      foundationStore,
      onCompactSession: handleCompactSession,
      onCopySessionId: handleCopySessionId,
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
    <SessionSidebarConnected {...sidebarState.sidebar} />
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
