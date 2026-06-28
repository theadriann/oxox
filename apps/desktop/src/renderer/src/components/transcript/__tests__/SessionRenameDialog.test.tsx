// @vitest-environment jsdom

import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { SessionRenameDialog } from '../SessionRenameDialog'

describe('SessionRenameDialog', () => {
  it('edits the draft and submits the rename request', () => {
    const onDraftChange = vi.fn()
    const onSubmit = vi.fn()
    const onOpenChange = vi.fn()

    render(
      <SessionRenameDialog
        open={true}
        draft="Alpha"
        isSaving={false}
        onDraftChange={onDraftChange}
        onOpenChange={onOpenChange}
        onSubmit={onSubmit}
      />,
    )

    fireEvent.change(screen.getByLabelText(/Session name/i), {
      target: { value: 'Beta' },
    })
    fireEvent.click(screen.getByRole('button', { name: /Save name/i }))

    expect(onDraftChange).toHaveBeenCalledWith('Beta')
    expect(onSubmit).toHaveBeenCalledTimes(1)
  })
})
