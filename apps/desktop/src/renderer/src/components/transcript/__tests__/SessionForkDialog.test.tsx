// @vitest-environment jsdom

import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { SessionForkDialog } from '../SessionForkDialog'

describe('SessionForkDialog', () => {
  it('edits the draft and submits the fork request', () => {
    const onDraftChange = vi.fn()
    const onSubmit = vi.fn()
    const onOpenChange = vi.fn()

    render(
      <SessionForkDialog
        open={true}
        draft="[Fork] Alpha"
        isSaving={false}
        onDraftChange={onDraftChange}
        onOpenChange={onOpenChange}
        onSubmit={onSubmit}
      />,
    )

    fireEvent.change(screen.getByLabelText(/Fork name/i), {
      target: { value: '[Fork] Beta' },
    })
    fireEvent.click(screen.getByRole('button', { name: /Create fork/i }))

    expect(onDraftChange).toHaveBeenCalledWith('[Fork] Beta')
    expect(onSubmit).toHaveBeenCalledTimes(1)
  })
})
