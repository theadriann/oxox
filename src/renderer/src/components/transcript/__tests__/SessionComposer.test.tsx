// @vitest-environment jsdom

import { fireEvent, render, screen } from '@testing-library/react'
import { useState } from 'react'
import type { ComposerContextUsageState } from '../../../stores/composerContextUsage'

import { SessionComposer } from '../SessionComposer'

function ControlledComposer({
  status = 'idle',
  isAttached = true,
  canAttach = true,
  onAttach = () => undefined,
  onInterrupt = () => undefined,
  onSubmit = () => undefined,
  composerContextUsage = null,
  composerContextUsageDisplayMode = 'percentage',
}: {
  status?: 'idle' | 'active' | 'waiting' | 'completed' | 'reconnecting' | 'error' | 'orphaned'
  isAttached?: boolean
  canAttach?: boolean
  onAttach?: () => void
  onInterrupt?: () => void
  onSubmit?: (payload: {
    text: string
    modelId: string
    interactionMode: string
    autonomyLevel: string
  }) => void
  composerContextUsage?: ComposerContextUsageState | null
  composerContextUsageDisplayMode?: 'percentage' | 'tokens'
}) {
  const [draft, setDraft] = useState('')
  const [modelId, setModelId] = useState('gpt-5.4')
  const [interactionMode, setInteractionMode] = useState('auto')
  const [autonomyLevel, setAutonomyLevel] = useState('medium')

  return (
    <SessionComposer
      availableModels={[
        { id: 'gpt-5.4', name: 'GPT 5.4' },
        { id: 'gpt-5.4-mini', name: 'GPT 5.4 Mini' },
      ]}
      canAttach={canAttach}
      draft={draft}
      isAttached={isAttached}
      isAttaching={false}
      isInterrupting={false}
      isSubmitting={false}
      composerContextUsage={composerContextUsage}
      composerContextUsageDisplayMode={composerContextUsageDisplayMode}
      selectedAutonomyLevel={autonomyLevel}
      selectedMode={interactionMode}
      selectedModelId={modelId}
      status={status}
      onAttach={onAttach}
      onAutonomyLevelChange={setAutonomyLevel}
      onDraftChange={setDraft}
      onInterrupt={onInterrupt}
      onModeChange={setInteractionMode}
      onModelChange={setModelId}
      onSubmit={onSubmit}
    />
  )
}

describe('SessionComposer', () => {
  it('submits via the send button with the selected model, mode, and autonomy level', () => {
    const onSubmit = vi.fn()

    render(<ControlledComposer onSubmit={onSubmit} />)

    fireEvent.change(screen.getByLabelText(/Message composer/i), {
      target: { value: 'Send with the composer button' },
    })

    fireEvent.click(screen.getByRole('button', { name: /Send message/i }))

    expect(onSubmit).toHaveBeenCalledWith({
      text: 'Send with the composer button',
      modelId: 'gpt-5.4',
      interactionMode: 'auto',
      autonomyLevel: 'medium',
    })
  })

  it('shows a working-state stop action and a completed-session disabled state', () => {
    const onInterrupt = vi.fn()
    const { rerender } = render(
      <ControlledComposer isAttached={true} onInterrupt={onInterrupt} status="active" />,
    )

    expect(screen.getByText(/Generating/i)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /Stop generation/i }))
    expect(onInterrupt).toHaveBeenCalledTimes(1)

    rerender(<ControlledComposer canAttach={false} isAttached={false} status="completed" />)

    expect(screen.getByText(/Session ended/i)).toBeTruthy()
    expect((screen.getByLabelText(/Message composer/i) as HTMLTextAreaElement).disabled).toBe(true)
  })

  it('enables the detached composer and send action when the session can still attach', () => {
    const onSubmit = vi.fn()

    render(<ControlledComposer canAttach={true} isAttached={false} onSubmit={onSubmit} />)

    const composer = screen.getByLabelText(/Message composer/i) as HTMLTextAreaElement
    const sendButton = screen.getByRole('button', { name: /Send message/i }) as HTMLButtonElement

    expect(composer.disabled).toBe(false)
    expect(sendButton.disabled).toBe(true)

    fireEvent.change(composer, {
      target: { value: 'Auto attach from send' },
    })
    fireEvent.click(sendButton)

    expect(onSubmit).toHaveBeenCalledWith({
      text: 'Auto attach from send',
      modelId: 'gpt-5.4',
      interactionMode: 'auto',
      autonomyLevel: 'medium',
    })
  })

  it('shows reconnect guidance when the live connection is lost or orphaned', () => {
    const onAttach = vi.fn()
    const { rerender } = render(
      <ControlledComposer
        canAttach={true}
        isAttached={true}
        onAttach={onAttach}
        status={'reconnecting' as never}
      />,
    )

    expect(screen.getByText(/Reconnecting/i)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /Reconnect$/i }))
    expect(onAttach).toHaveBeenCalledTimes(1)

    rerender(
      <ControlledComposer
        canAttach={true}
        isAttached={false}
        onAttach={onAttach}
        status={'orphaned' as never}
      />,
    )

    expect(screen.getByText(/Reconnect to continue/i)).toBeTruthy()
    expect(screen.getByRole('button', { name: /Reconnect$/i })).toBeTruthy()
  })

  it('shows a context usage percentage next to send and exposes the full breakdown in a tooltip', async () => {
    render(
      <ControlledComposer
        composerContextUsage={{
          contextLimit: 258000,
          usedContext: 78000,
          remainingContext: 180000,
          usedPercentage: 30,
          totalProcessedTokens: 298000,
        }}
      />,
    )

    expect(screen.getByText('30%')).toBeTruthy()
    const contextUsageButton = screen.getByRole('button', { name: /Context usage/i })

    expect(contextUsageButton.getAttribute('title')).toMatch(/78k\/258k context used/i)
    expect(contextUsageButton.getAttribute('title')).toMatch(/Total processed: 298k tokens/i)
  })

  it('shows a placeholder instead of guessing when exact context usage is unavailable', () => {
    render(<ControlledComposer />)

    expect(screen.getByText('--')).toBeTruthy()
  })
})
