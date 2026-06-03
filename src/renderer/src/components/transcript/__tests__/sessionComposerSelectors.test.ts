import { describe, expect, it, vi } from 'vitest'

import { createMemoryPersistencePort } from '../../../platform/persistence'
import { ModelPickerStore } from '../../../state/model-picker/model-picker.model'
import { UIStore } from '../../../state/ui/ui.model'
import { buildSessionComposerProps } from '../sessionComposerSelectors'

describe('buildSessionComposerProps', () => {
  it('builds attached-session composer props and routes actions through the composer store', () => {
    const attachSelected = vi.fn()
    const interruptSelected = vi.fn()
    const submit = vi.fn()
    const updatePreferences = vi.fn()
    const modelPickerStore = new ModelPickerStore(createMemoryPersistencePort())
    const props = buildSessionComposerProps({
      composerStore: {
        attachSelected,
        canAttachSelected: true,
        detachedComposerError: null,
        draft: 'hello',
        error: 'outer error',
        interruptSelected,
        isAttachingSelected: false,
        isInterruptingSelected: false,
        isSendingSelected: true,
        selectedComposerContextUsage: {
          contextLimit: 258000,
          usedContext: 78000,
          remainingContext: 180000,
          usedPercentage: 30,
          totalProcessedTokens: 298000,
        },
        selectedAvailableModels: [{ id: 'gpt-5.4', name: 'GPT 5.4' }],
        selectedPreferences: {
          autonomyLevel: 'medium',
          interactionMode: 'auto',
          modelId: 'gpt-5.4',
        },
        selectedStatus: 'active',
        setDraft: vi.fn(),
        submit,
        updatePendingDraftPreferences: vi.fn(),
        updatePreferences,
      } as never,
      isSubmittingDetached: false,
      liveSessionStore: {
        selectedSnapshot: { sessionId: 'live-1' },
      } as never,
      modelPickerStore,
      onAttach: undefined,
      onSubmitDetached: undefined,
      sessionStore: {
        selectedSessionId: 'session-1',
      } as never,
      uiStore: new UIStore(createMemoryPersistencePort()),
    })

    expect(props.error).toBe('outer error')
    expect(props.composer.canAttach).toBe(true)
    expect(props.composer.isAttached).toBe(true)
    expect(props.composer.isSubmitting).toBe(true)
    expect(props.composer.composerContextUsageDisplayMode).toBe('percentage')
    expect(props.composer.composerContextUsage?.usedPercentage).toBe(30)
    expect(props.composer.selectedAutonomyLevel).toBe('medium')

    props.composer.onAttach()
    props.composer.onInterrupt()
    props.composer.onModeChange('spec')
    props.composer.onModelChange('claude')
    props.composer.onAutonomyLevelChange('high')
    props.composer.onSubmit({
      text: 'hi',
      modelId: 'gpt-5.4',
      interactionMode: 'auto',
      autonomyLevel: 'medium',
    })

    expect(attachSelected).toHaveBeenCalledTimes(1)
    expect(interruptSelected).toHaveBeenCalledTimes(1)
    expect(updatePreferences).toHaveBeenCalledWith('session-1', { interactionMode: 'spec' })
    expect(updatePreferences).toHaveBeenCalledWith('session-1', { modelId: 'claude' })
    expect(updatePreferences).toHaveBeenCalledWith('session-1', { autonomyLevel: 'high' })
    expect(submit).toHaveBeenCalledWith({
      text: 'hi',
      modelId: 'gpt-5.4',
      interactionMode: 'auto',
      autonomyLevel: 'medium',
    })
  })

  it('builds detached-session composer props and routes actions through external callbacks', () => {
    const onAttach = vi.fn()
    const onSubmitDetached = vi.fn()
    const updatePendingDraftPreferences = vi.fn()
    const modelPickerStore = new ModelPickerStore(createMemoryPersistencePort())
    const props = buildSessionComposerProps({
      canComposeDetached: true,
      composerStore: {
        attachSelected: vi.fn(),
        canAttachSelected: false,
        detachedComposerError: null,
        draft: 'draft',
        error: null,
        interruptSelected: vi.fn(),
        isAttachingSelected: false,
        isInterruptingSelected: false,
        isSendingSelected: false,
        selectedComposerContextUsage: null,
        selectedAvailableModels: [],
        selectedPreferences: {
          autonomyLevel: 'medium',
          interactionMode: 'auto',
          modelId: 'gpt-5.4',
        },
        selectedStatus: 'idle',
        setDraft: vi.fn(),
        submit: vi.fn(),
        updatePendingDraftPreferences,
        updatePreferences: vi.fn(),
      } as never,
      isSubmittingDetached: true,
      liveSessionStore: {
        selectedSnapshot: null,
      } as never,
      modelPickerStore,
      onAttach,
      onSubmitDetached,
      sessionStore: {
        selectedSessionId: '',
      } as never,
      uiStore: createUIStore({ composerContextUsageDisplayMode: 'tokens' }),
    })

    expect(props.composer.canComposeDetached).toBe(true)
    expect(props.composer.composerContextUsage).toBeNull()
    expect(props.composer.composerContextUsageDisplayMode).toBe('tokens')
    expect(props.composer.isAttached).toBe(false)
    expect(props.composer.isSubmitting).toBe(true)

    props.composer.onAttach()
    props.composer.onModeChange('spec')
    props.composer.onModelChange('claude')
    props.composer.onAutonomyLevelChange('low')
    props.composer.onSubmit({
      text: 'hi',
      modelId: 'claude',
      interactionMode: 'spec',
      autonomyLevel: 'low',
    })

    expect(onAttach).toHaveBeenCalledTimes(1)
    expect(updatePendingDraftPreferences).toHaveBeenCalledWith({ interactionMode: 'spec' })
    expect(updatePendingDraftPreferences).toHaveBeenCalledWith({ modelId: 'claude' })
    expect(updatePendingDraftPreferences).toHaveBeenCalledWith({ autonomyLevel: 'low' })
    expect(onSubmitDetached).toHaveBeenCalledWith({
      text: 'hi',
      modelId: 'claude',
      interactionMode: 'spec',
      autonomyLevel: 'low',
    })
  })
})

function createUIStore({
  composerContextUsageDisplayMode,
}: {
  composerContextUsageDisplayMode: 'percentage' | 'tokens'
}): UIStore {
  const uiStore = new UIStore(createMemoryPersistencePort())
  uiStore.setComposerContextUsageDisplayMode(composerContextUsageDisplayMode)
  return uiStore
}
