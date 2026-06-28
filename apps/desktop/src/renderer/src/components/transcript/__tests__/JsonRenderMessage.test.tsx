// @vitest-environment jsdom

import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { JsonRenderMessage } from '../JsonRenderMessage'

describe('JsonRenderMessage', () => {
  it('renders callouts with alert semantics and progress bars with progress semantics', () => {
    render(
      <JsonRenderMessage
        spec={{
          root: 'root',
          elements: {
            root: {
              type: 'Box',
              props: { flexDirection: 'column', gap: 3 },
              children: ['callout', 'progress', 'table'],
            },
            callout: {
              type: 'Callout',
              props: {
                type: 'warning',
                title: 'Heads up',
                content: 'Retry is in progress.',
              },
              children: [],
            },
            progress: {
              type: 'ProgressBar',
              props: { label: 'Migration', progress: 0.42 },
              children: [],
            },
            table: {
              type: 'Table',
              props: {
                columns: [
                  { header: 'Step', key: 'step' },
                  { header: 'State', key: 'state' },
                ],
                rows: [{ step: 'Connect', state: 'Done' }],
              },
              children: [],
            },
          },
        }}
      />,
    )

    const alert = screen.getByRole('alert')

    expect(alert.textContent).toContain('Heads up')
    expect(alert.textContent).toContain('Retry is in progress.')
    expect(screen.getByText('Migration')).toBeTruthy()
    expect(screen.getByText('42%')).toBeTruthy()
    expect(screen.getByRole('progressbar')).toBeTruthy()
    expect(screen.getByRole('table')).toBeTruthy()
    expect(screen.getByRole('columnheader', { name: 'Step' })).toBeTruthy()
  })
})
