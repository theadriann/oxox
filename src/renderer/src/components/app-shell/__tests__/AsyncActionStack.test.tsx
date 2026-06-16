// @vitest-environment jsdom

import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { AsyncActionItem } from '../../../state/composer/composer.model'
import { AsyncActionStack } from '../AsyncActionStack'

function createAction(overrides: Partial<AsyncActionItem> = {}): AsyncActionItem {
  return {
    id: 'action-1',
    title: 'Creating fork',
    description: '[Fork] Alpha',
    status: 'running',
    updatedAt: 1,
    ...overrides,
  }
}

describe('AsyncActionStack', () => {
  it('renders running and completed background actions', () => {
    render(
      <AsyncActionStack
        actions={[
          createAction(),
          createAction({
            id: 'action-2',
            title: 'Fork created',
            status: 'success',
          }),
        ]}
        onDismiss={vi.fn()}
      />,
    )

    expect(screen.getByLabelText('Background actions')).toBeTruthy()
    expect(screen.getByText('Creating fork')).toBeTruthy()
    expect(screen.getByText('Fork created')).toBeTruthy()
    expect(screen.getByRole('button', { name: /Dismiss background action/i })).toBeTruthy()
  })

  it('dismisses completed actions', () => {
    const onDismiss = vi.fn()

    render(
      <AsyncActionStack
        actions={[
          createAction({
            status: 'success',
          }),
        ]}
        onDismiss={onDismiss}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: /Dismiss background action/i }))

    expect(onDismiss).toHaveBeenCalledWith('action-1')
  })
})
