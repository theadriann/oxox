import { describe, expect, it, vi } from 'vitest'

import { buildSessionComposerProps } from '../sessionComposerSelectors'

describe('buildSessionComposerProps', () => {
  it('builds attached-session composer props and routes actions through the composer store', () => {
    const attachSelected = vi.fn()
    const interruptSelected = vi.fn()
    const submit = vi.fn()
    const updatePreferences = vi.fn()
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
      onAttach: undefined,
      onSubmitDetached: undefined,
      sessionStore: {
        selectedSessionId: 'session-1',
      } as never,
    })

    expect(props.error).toBe('outer error')
    expect(props.composer.canAttach).toBe(true)
    expect(props.composer.isAttached).toBe(true)
    expect(props.composer.isSubmitting).toBe(true)
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
      onAttach,
      onSubmitDetached,
      sessionStore: {
        selectedSessionId: '',
      } as never,
    })

    expect(props.composer.canComposeDetached).toBe(true)
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
