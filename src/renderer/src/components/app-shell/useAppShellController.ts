import { useCallback, useMemo, useRef, useState } from 'react'

import { useAppRuntime } from '../../hooks/useAppRuntime'
import { useCommandPalette } from '../../hooks/useCommandPalette'
import { useKeyboardShortcuts } from '../../hooks/useKeyboardShortcuts'
import { useNewSessionForm } from '../../hooks/useNewSessionForm'
import { usePanelResize } from '../../hooks/usePanelResize'
import type { RootStore } from '../../stores/RootStore'
import type { StoreContextValue } from '../../stores/StoreProvider'
import { createAppShellKeyboardShortcuts } from './appShellKeyboardShortcuts'

interface UseAppShellControllerOptions
  extends Pick<
    StoreContextValue,
    | 'composerStore'
    | 'foundationStore'
    | 'liveSessionStore'
    | 'pluginCapabilityStore'
    | 'pluginHostStore'
    | 'sessionStore'
    | 'transcriptStore'
    | 'uiStore'
  > {
  rootStore: RootStore
}

export function useAppShellController({
  composerStore,
  foundationStore,
  liveSessionStore,
  pluginCapabilityStore,
  pluginHostStore,
  rootStore,
  sessionStore,
  transcriptStore,
  uiStore,
}: UseAppShellControllerOptions) {
  const [transcriptScrollSignal, setTranscriptScrollSignal] = useState(0)
  const detailPanelRef = useRef<HTMLElement | null>(null)
  const contextPanelRef = useRef<HTMLElement | null>(null)
  const contextPanelToggleButtonRef = useRef<HTMLButtonElement | null>(null)
  const transcriptPrimaryActionRef = useRef<HTMLElement | null>(null)
  const newSessionForm = useNewSessionForm({
    sessionStore,
    liveSessionStore,
    composerStore,
    dialogApi: rootStore.api.dialog,
    sessionApi: rootStore.api.session,
  })
  const { startSidebarResize, startContextPanelResize } = usePanelResize({ uiStore })

  const focusTranscriptPrimaryAction = useCallback(() => {
    ;(transcriptPrimaryActionRef.current ?? detailPanelRef.current)?.focus()
  }, [])

  const handleBrowseSessions = useCallback(() => {
    uiStore.showSidebar()
    window.requestAnimationFrame(() => {
      document.querySelector<HTMLElement>('[data-session-item][tabindex="0"]')?.focus()
    })
  }, [uiStore])

  const handleSelectSession = useCallback(
    (sessionId: string) => {
      if (newSessionForm.showForm) {
        newSessionForm.closeForm()
      }

      sessionStore.selectSession(sessionId)
      setTranscriptScrollSignal((current) => current + 1)
    },
    [newSessionForm, sessionStore],
  )

  useAppRuntime({
    rootStore,
    composerStore,
    foundationStore,
    liveSessionStore,
    pluginCapabilityStore,
    pluginHostStore,
    sessionStore,
    transcriptStore,
    onSelectSession: handleSelectSession,
  })

  const handleAttachSelectedSession = useCallback(async () => {
    const attached = await composerStore.attachSelected()

    if (attached) {
      window.requestAnimationFrame(focusTranscriptPrimaryAction)
    }
  }, [composerStore, focusTranscriptPrimaryAction])

  const handleForkSelectedSession = useCallback(async () => {
    await composerStore.forkSelected()
    setTranscriptScrollSignal((current) => current + 1)
  }, [composerStore])

  const handleRenameSelectedSession = useCallback(() => {
    composerStore.renameWorkflow.openRenameDialog()
  }, [composerStore])

  const handleRewindSelectedSession = useCallback(() => {
    composerStore.rewindWorkflow.openRewindDialog()
  }, [composerStore])

  const commandPalette = useCommandPalette({
    liveSessionStore,
    pluginCapabilityStore,
    pluginHostStore,
    sessionStore,
    uiStore,
    onAttachSelectedSession: handleAttachSelectedSession,
    onCopySelectedSessionId: composerStore.copySelectedId,
    onDetachSelectedSession: composerStore.detachSelected,
    onFocusTranscriptPrimaryAction: focusTranscriptPrimaryAction,
    onForkSelectedSession: handleForkSelectedSession,
    onRenameSelectedSession: handleRenameSelectedSession,
    onRewindSelectedSession: handleRewindSelectedSession,
    onOpenNewWindow: () => rootStore.api.app.openNewWindow?.(),
    onPickDirectory: newSessionForm.openDraft,
    onSelectSession: handleSelectSession,
  })

  const keyboardShortcuts = useMemo(
    () =>
      createAppShellKeyboardShortcuts({
        composerStore,
        closeCommandPalette: commandPalette.closePalette,
        liveSessionStore,
        newSessionForm,
        openCommandPalette: commandPalette.openPalette,
        uiStore,
        onAttachSelectedSession: () => {
          void handleAttachSelectedSession()
        },
        onFocusContextPanelToggle: () => {
          window.requestAnimationFrame(() => contextPanelToggleButtonRef.current?.focus())
        },
        onOpenSettings: () => {
          uiStore.openSettings()
        },
      }),
    [
      commandPalette.closePalette,
      commandPalette.openPalette,
      composerStore,
      handleAttachSelectedSession,
      liveSessionStore,
      newSessionForm,
      uiStore,
    ],
  )

  useKeyboardShortcuts(keyboardShortcuts)

  return {
    commandPalette,
    contextPanelRef,
    contextPanelToggleButtonRef,
    detailPanelRef,
    handleAttachSelectedSession,
    handleBrowseSessions,
    handleForkSelectedSession,
    handleRewindSelectedSession,
    handleSelectSession,
    newSessionForm,
    startContextPanelResize,
    startSidebarResize,
    transcriptPrimaryActionRef,
    transcriptScrollSignal,
  }
}
