// @vitest-environment jsdom

import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { SessionCompactDialog } from '../SessionCompactDialog'

describe('SessionCompactDialog', () => {
  it('edits instructions, shows the compaction model, and submits', () => {
    const onCustomInstructionsChange = vi.fn()
    const onSubmit = vi.fn()

    render(
      <SessionCompactDialog
        open={true}
        customInstructions=""
        compactionModel="gpt-5.4-mini"
        currentModelId="gpt-5.4"
        models={[
          { id: 'gpt-5.4', name: 'GPT 5.4' },
          { id: 'gpt-5.4-mini', name: 'GPT 5.4 Mini' },
        ]}
        isSaving={false}
        onCustomInstructionsChange={onCustomInstructionsChange}
        onCompactionModelChange={vi.fn()}
        onOpenChange={vi.fn()}
        onSubmit={onSubmit}
      />,
    )

    fireEvent.change(screen.getByLabelText(/additional instructions/i), {
      target: { value: 'Keep only decisions and open tasks' },
    })
    fireEvent.click(screen.getByRole('button', { name: /^compress session$/i }))

    expect(onCustomInstructionsChange).toHaveBeenCalledWith('Keep only decisions and open tasks')
    expect(screen.getByText('GPT 5.4 Mini')).toBeTruthy()
    expect(onSubmit).toHaveBeenCalledTimes(1)
  })
})
