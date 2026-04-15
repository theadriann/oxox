// @vitest-environment jsdom

import { act, render, screen } from '@testing-library/react'

import { StatusBar } from '../StatusBar'

describe('StatusBar', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('renders the connected daemon state, active session count, last sync, and CLI version', () => {
    render(
      <StatusBar
        activeSessionCount={2}
        connectedPort={37643}
        daemonStatus="connected"
        droidCliVersion="0.84.0"
        lastSyncAt="2026-03-25T00:01:01.000Z"
        nextRetryDelayMs={null}
        updateStatusLabel="Downloading update…"
        now={Date.parse('2026-03-25T00:03:01.000Z')}
      />,
    )

    expect(screen.getByText(/Connected/)).toBeTruthy()
    expect(screen.getByText('2 active sessions')).toBeTruthy()
    expect(screen.getByText(/2m ago/)).toBeTruthy()
    expect(screen.getByText('Downloading update…')).toBeTruthy()
    expect(screen.getByText('droid 0.84.0')).toBeTruthy()
    expect(screen.getByTestId('daemon-status-indicator').className).toContain('bg-fd-ready')
  })

  it('renders reconnecting and disconnected states with the expected indicator colors', () => {
    const { rerender } = render(
      <StatusBar
        activeSessionCount={1}
        connectedPort={null}
        daemonStatus="reconnecting"
        droidCliVersion="0.84.0"
        lastSyncAt="2026-03-25T00:02:59.000Z"
        nextRetryDelayMs={2_000}
        updateStatusLabel={null}
        now={Date.parse('2026-03-25T00:03:01.000Z')}
      />,
    )

    expect(screen.getByText(/Reconnecting/)).toBeTruthy()
    expect(screen.getByTitle('Retrying in 2s')).toBeTruthy()
    expect(screen.getByTestId('daemon-status-indicator').className).toContain('bg-fd-warning')

    rerender(
      <StatusBar
        activeSessionCount={0}
        connectedPort={null}
        daemonStatus="disconnected"
        droidCliVersion={null}
        lastSyncAt={null}
        nextRetryDelayMs={null}
        updateStatusLabel={null}
        now={Date.parse('2026-03-25T00:03:01.000Z')}
      />,
    )

    expect(screen.getByText(/Disconnected/)).toBeTruthy()
    expect(screen.getByText('0 active sessions')).toBeTruthy()
    expect(screen.getByText(/never/)).toBeTruthy()
    expect(screen.getByTestId('daemon-status-indicator').className).toContain('bg-fd-danger')
  })

  it('refreshes the relative sync timestamp as time advances', () => {
    const { rerender } = render(
      <StatusBar
        activeSessionCount={1}
        connectedPort={37643}
        daemonStatus="connected"
        droidCliVersion="0.84.0"
        lastSyncAt="2026-03-25T00:01:01.000Z"
        nextRetryDelayMs={null}
        updateStatusLabel={null}
        now={Date.parse('2026-03-25T00:03:01.000Z')}
      />,
    )

    expect(screen.getByText(/2m ago/)).toBeTruthy()

    rerender(
      <StatusBar
        activeSessionCount={1}
        connectedPort={37643}
        daemonStatus="connected"
        droidCliVersion="0.84.0"
        lastSyncAt="2026-03-25T00:01:01.000Z"
        nextRetryDelayMs={null}
        updateStatusLabel={null}
        now={Date.parse('2026-03-25T00:04:31.000Z')}
      />,
    )

    expect(screen.getByText(/4m ago/)).toBeTruthy()
  })

  it('refreshes the relative sync timestamp over time when now is omitted', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-03-25T00:03:01.000Z'))

    render(
      <StatusBar
        activeSessionCount={1}
        connectedPort={37643}
        daemonStatus="connected"
        droidCliVersion="0.84.0"
        lastSyncAt="2026-03-25T00:03:00.000Z"
        nextRetryDelayMs={null}
        updateStatusLabel={null}
      />,
    )

    expect(screen.getByText(/just now/)).toBeTruthy()

    await act(async () => {
      await vi.advanceTimersByTimeAsync(6_000)
    })

    expect(screen.getByText(/7s ago/)).toBeTruthy()
  })
})
