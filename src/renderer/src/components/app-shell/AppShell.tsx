import { useReducedMotion } from 'framer-motion'
import { observer } from 'mobx-react-lite'
import { useMemo } from 'react'
import { useStores } from '../../stores/StoreProvider'
import { SessionRenameDialogConnected } from '../transcript/SessionRenameDialogConnected'
import { SessionRewindDialogConnected } from '../transcript/SessionRewindDialogConnected'
import { AppShellView } from './AppShellView'
import { useAppShellController } from './useAppShellController'
import { useAppShellViewModel } from './useAppShellViewModel'

export const AppShell = observer(() => {
  const {
    composerStore,
    foundationStore,
    liveSessionStore,
    pluginCapabilityStore,
    pluginHostStore,
    rootStore,
    sessionStore,
    transcriptStore,
    uiStore,
    updateStore,
  } = useStores()
  const prefersReducedMotion = useReducedMotion()
  const {
    commandPalette,
    contextPanelRef,
    contextPanelToggleButtonRef,
    detailPanelRef,
    handleAttachSelectedSession,
    handleBrowseSessions,
    newSessionForm,
    startContextPanelResize,
    startSidebarResize,
    transcriptPrimaryActionRef,
    transcriptScrollSignal,
  } = useAppShellController({
    composerStore,
    foundationStore,
    liveSessionStore,
    pluginCapabilityStore,
    pluginHostStore,
    rootStore,
    sessionStore,
    transcriptStore,
    uiStore,
    updateStore,
  })
  const {
    canComposeDetached,
    detailViewKey,
    sessionProjectLabel,
    sessionTitle,
    shouldAnimate,
    shouldRenderComposer,
    sidebarErrorState,
  } = useAppShellViewModel({
    foundationStore,
    liveSessionStore,
    newSessionForm,
    prefersReducedMotion,
    sessionStore,
  })
  const controller = useMemo(
    () => ({
      contextPanelRef,
      contextPanelToggleButtonRef,
      detailPanelRef,
      handleAttachSelectedSession,
      handleBrowseSessions,
      newSessionForm,
      startContextPanelResize,
      startSidebarResize,
      transcriptPrimaryActionRef,
      transcriptScrollSignal,
    }),
    [
      contextPanelRef,
      contextPanelToggleButtonRef,
      detailPanelRef,
      handleAttachSelectedSession,
      handleBrowseSessions,
      newSessionForm,
      startContextPanelResize,
      startSidebarResize,
      transcriptPrimaryActionRef,
      transcriptScrollSignal,
    ],
  )
  const uiState = useMemo(
    () => ({
      contentLayout: uiStore.contentLayout,
      isContextPanelHidden: uiStore.isContextPanelHidden,
      isSidebarHidden: uiStore.isSidebarHidden,
      isSettingsOpen: uiStore.isSettingsOpen,
      settingsSection: uiStore.settingsSection,
      toggleContextPanel: uiStore.toggleContextPanel,
      toggleSidebar: uiStore.toggleSidebar,
    }),
    [
      uiStore.contentLayout,
      uiStore.isContextPanelHidden,
      uiStore.isSidebarHidden,
      uiStore.isSettingsOpen,
      uiStore.settingsSection,
      uiStore.toggleContextPanel,
      uiStore.toggleSidebar,
    ],
  )
  const viewModel = useMemo(
    () => ({
      canComposeDetached,
      detailViewKey,
      sessionProjectLabel,
      sessionTitle,
      shouldAnimate,
      shouldRenderComposer,
      sidebarErrorState,
    }),
    [
      canComposeDetached,
      detailViewKey,
      sessionProjectLabel,
      sessionTitle,
      shouldAnimate,
      shouldRenderComposer,
      sidebarErrorState,
    ],
  )

  return (
    <>
      <SessionRenameDialogConnected />
      <SessionRewindDialogConnected />
      <AppShellView
        commandPalette={commandPalette}
        controller={controller}
        prefersReducedMotion={prefersReducedMotion}
        uiState={uiState}
        viewModel={viewModel}
      />
    </>
  )
})
