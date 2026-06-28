// @vitest-environment jsdom

import { fireEvent, render, screen } from '@testing-library/react'

import { UpdatePrompt } from '../UpdatePrompt'

describe('UpdatePrompt', () => {
  it('renders restart-ready messaging and dispatches actions', () => {
    const onDismiss = vi.fn()
    const onRestart = vi.fn()

    render(<UpdatePrompt downloadedVersion="0.0.5" onDismiss={onDismiss} onRestart={onRestart} />)

    expect(screen.getByRole('alert').textContent).toContain('Update ready')
    expect(screen.getByText(/Version 0.0.5 has been downloaded/i)).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Later' }))
    fireEvent.click(screen.getByRole('button', { name: 'Restart to update' }))

    expect(onDismiss).toHaveBeenCalledTimes(1)
    expect(onRestart).toHaveBeenCalledTimes(1)
  })
})
