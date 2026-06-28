// @vitest-environment jsdom

import { act, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { useTimeTick } from '../useTimeTick'

function TimeTickProbe() {
  const now = useTimeTick()

  return <output data-testid="time-tick-now">{String(now)}</output>
}

function TimeTickPairProbe() {
  const first = useTimeTick()
  const second = useTimeTick()

  return (
    <>
      <output data-testid="time-tick-first">{String(first)}</output>
      <output data-testid="time-tick-second">{String(second)}</output>
    </>
  )
}

describe('useTimeTick', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('returns the current time and updates it every second', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-03-25T00:00:00.000Z'))

    render(<TimeTickProbe />)

    expect(screen.getByTestId('time-tick-now').textContent).toBe(
      String(new Date('2026-03-25T00:00:00.000Z').getTime()),
    )

    act(() => {
      vi.advanceTimersByTime(1_000)
    })

    expect(screen.getByTestId('time-tick-now').textContent).toBe(
      String(new Date('2026-03-25T00:00:01.000Z').getTime()),
    )
  })

  it('shares a single interval between multiple subscribers using the same cadence', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-03-25T00:00:00.000Z'))

    const setIntervalSpy = vi.spyOn(window, 'setInterval')

    render(<TimeTickPairProbe />)

    expect(setIntervalSpy).toHaveBeenCalledTimes(1)

    act(() => {
      vi.advanceTimersByTime(1_000)
    })

    expect(screen.getByTestId('time-tick-first').textContent).toBe(
      String(new Date('2026-03-25T00:00:01.000Z').getTime()),
    )
    expect(screen.getByTestId('time-tick-second').textContent).toBe(
      String(new Date('2026-03-25T00:00:01.000Z').getTime()),
    )
  })
})
