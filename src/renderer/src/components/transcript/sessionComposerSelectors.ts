import type { SessionComposerProps } from './SessionComposer'

interface SessionComposerConnectedSelectorOptions {
  canComposeDetached?: boolean
  composerStore: {
    attachSelected: () => Promise<void> | void
    canAttachSelected: boolean
    detachedComposerError: string | null
    draft: string
    error: string | null
    interruptSelected: () => Promise<void> | void
    isAttachingSelected: boolean
    isInterruptingSelected: boolean
    isSendingSelected: boolean
    selectedAvailableModels: SessionComposerProps['availableModels']
    selectedPreferences: {
      autonomyLevel: string
      interactionMode: string
      modelId: string
    }
    selectedStatus: SessionComposerProps['status']
    setDraft: (value: string) => void
    submit: (payload: {
      text: string
      modelId: string
      interactionMode: string
      autonomyLevel: string
    }) => Promise<void> | void
    updatePendingDraftPreferences: (
      payload: Partial<{ autonomyLevel: string; interactionMode: string; modelId: string }>,
    ) => void
    updatePreferences: (
      sessionId: string,
      payload: Partial<{ autonomyLevel: string; interactionMode: string; modelId: string }>,
    ) => Promise<void> | void
  }
  isSubmittingDetached: boolean
  liveSessionStore: {
    selectedSnapshot: unknown
  }
  onAttach?: () => void
  onSubmitDetached?: (payload: {
    text: string
    modelId: string
    interactionMode: string
    autonomyLevel: string
  }) => void | Promise<void>
  sessionStore: {
    selectedSessionId: string
  }
}

export function buildSessionComposerProps({
  canComposeDetached = false,
  composerStore,
  isSubmittingDetached,
  liveSessionStore,
  onAttach,
  onSubmitDetached,
  sessionStore,
}: SessionComposerConnectedSelectorOptions): {
  error: string | null
  composer: SessionComposerProps
} {
  const selectedSessionId = sessionStore.selectedSessionId
  const detachedComposerError = composerStore.detachedComposerError
  const canUseDetachedComposer = selectedSessionId
    ? !detachedComposerError
    : canComposeDetached && !detachedComposerError

  return {
    error: composerStore.error ?? detachedComposerError,
    composer: {
      availableModels: composerStore.selectedAvailableModels,
      canAttach: selectedSessionId ? composerStore.canAttachSelected : false,
      canComposeDetached: canUseDetachedComposer,
      draft: composerStore.draft,
      isAttached: Boolean(liveSessionStore.selectedSnapshot),
      isAttaching: composerStore.isAttachingSelected,
      isInterrupting: composerStore.isInterruptingSelected,
      isSubmitting: selectedSessionId ? composerStore.isSendingSelected : isSubmittingDetached,
      onAttach: () => {
        if (onAttach) {
          onAttach()
          return
        }

        void composerStore.attachSelected()
      },
      onAutonomyLevelChange: (value) => {
        if (!selectedSessionId) {
          composerStore.updatePendingDraftPreferences({ autonomyLevel: value })
          return
        }

        void composerStore.updatePreferences(selectedSessionId, { autonomyLevel: value })
      },
      onDraftChange: composerStore.setDraft,
      onInterrupt: () => void composerStore.interruptSelected(),
      onModeChange: (value) => {
        if (!selectedSessionId) {
          composerStore.updatePendingDraftPreferences({ interactionMode: value })
          return
        }

        void composerStore.updatePreferences(selectedSessionId, { interactionMode: value })
      },
      onModelChange: (value) => {
        if (!selectedSessionId) {
          composerStore.updatePendingDraftPreferences({ modelId: value })
          return
        }

        void composerStore.updatePreferences(selectedSessionId, { modelId: value })
      },
      onSubmit: (payload) => {
        if (!selectedSessionId && onSubmitDetached) {
          void onSubmitDetached(payload)
          return
        }

        void composerStore.submit(payload)
      },
      selectedAutonomyLevel: composerStore.selectedPreferences.autonomyLevel,
      selectedMode: composerStore.selectedPreferences.interactionMode,
      selectedModelId: composerStore.selectedPreferences.modelId,
      status: composerStore.selectedStatus,
    },
  }
}
