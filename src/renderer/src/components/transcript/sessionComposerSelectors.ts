import type { UIStore } from '../../state/ui/ui.model'
import type { SessionComposerProps } from './SessionComposer'

interface SessionComposerConnectedSelectorOptions {
  canComposeDetached?: boolean
  composerStore: {
    attachSelected: () => Promise<void> | void
    canAttachSelected: boolean
    detachedComposerError: string | null
    draft: string
    error: string | null
    imageAttachments: SessionComposerProps['imageAttachments']
    addImageAttachments: SessionComposerProps['onImageAttachmentsAdd']
    clearImageAttachments: SessionComposerProps['onImageAttachmentsClear']
    interruptSelected: () => Promise<void> | void
    isAttachingSelected: boolean
    isInterruptingSelected: boolean
    isSendingSelected: boolean
    selectedComposerContextUsage: SessionComposerProps['composerContextUsage']
    selectedAvailableModels: SessionComposerProps['availableModels']
    selectedPreferences: {
      autonomyLevel: string
      interactionMode: string
      modelId: string
      reasoningEffort: string
    }
    selectedStatus: SessionComposerProps['status']
    removeImageAttachment: SessionComposerProps['onImageAttachmentRemove']
    setDraft: (value: string) => void
    submit: (payload: {
      text: string
      modelId: string
      interactionMode: string
      reasoningEffort?: string
      autonomyLevel: string
      images?: Parameters<SessionComposerProps['onSubmit']>[0]['images']
    }) => Promise<void> | void
    updatePendingDraftPreferences: (
      payload: Partial<{
        autonomyLevel: string
        interactionMode: string
        modelId: string
        reasoningEffort: string
      }>,
    ) => void
    updatePreferences: (
      sessionId: string,
      payload: Partial<{
        autonomyLevel: string
        interactionMode: string
        modelId: string
        reasoningEffort: string
      }>,
    ) => Promise<void> | void
  }
  isSubmittingDetached: boolean
  liveSessionStore: {
    selectedSnapshot: unknown
  }
  modelPickerStore: {
    buildViewModel: (
      models: SessionComposerProps['availableModels'],
      selectedModelId: string,
    ) => SessionComposerProps['modelPickerViewModel']
    searchQuery: string
    activeCategory: string
    toggleFavorite: (modelId: string) => void
    set searchQuery(value: string)
    set activeCategory(value: string)
  }
  onAttach?: () => void
  onSubmitDetached?: (payload: {
    text: string
    modelId: string
    interactionMode: string
    autonomyLevel: string
    images?: Parameters<SessionComposerProps['onSubmit']>[0]['images']
  }) => void | Promise<void>
  sessionStore: {
    selectedSessionId: string
  }
  uiStore: UIStore
}

export function buildSessionComposerProps({
  canComposeDetached = false,
  composerStore,
  isSubmittingDetached,
  liveSessionStore,
  modelPickerStore,
  onAttach,
  onSubmitDetached,
  sessionStore,
  uiStore,
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
      composerContextUsage: composerStore.selectedComposerContextUsage,
      composerContextUsageDisplayMode: uiStore.state$.composerContextUsageDisplayMode.get(),
      draft: composerStore.draft,
      imageAttachments: composerStore.imageAttachments,
      isAttached: Boolean(liveSessionStore.selectedSnapshot),
      isAttaching: composerStore.isAttachingSelected,
      isInterrupting: composerStore.isInterruptingSelected,
      isSubmitting: selectedSessionId ? composerStore.isSendingSelected : isSubmittingDetached,
      modelPickerViewModel: modelPickerStore.buildViewModel(
        composerStore.selectedAvailableModels,
        composerStore.selectedPreferences.modelId,
      ),
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
      onImageAttachmentsClear: composerStore.clearImageAttachments,
      onImageAttachmentRemove: composerStore.removeImageAttachment,
      onImageAttachmentsAdd: composerStore.addImageAttachments,
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
      onReasoningEffortChange: (value) => {
        if (!selectedSessionId) {
          composerStore.updatePendingDraftPreferences({ reasoningEffort: value })
          return
        }

        void composerStore.updatePreferences(selectedSessionId, { reasoningEffort: value })
      },
      onModelPickerSearchChange: (query) => {
        modelPickerStore.searchQuery = query
      },
      onModelPickerToggleFavorite: (modelId) => {
        modelPickerStore.toggleFavorite(modelId)
      },
      onModelPickerCategoryChange: (category) => {
        modelPickerStore.activeCategory = category
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
      selectedReasoningEffort: composerStore.selectedPreferences.reasoningEffort,
      status: composerStore.selectedStatus,
    },
  }
}
