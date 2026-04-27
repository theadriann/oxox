import { afterEach, describe, expect, it, vi } from 'vitest'

import { SessionSearchController } from '../SessionSearchController'

describe('SessionSearchController', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('clears matches for empty queries without invoking IPC', async () => {
    const searchSessions = vi.fn()
    const controller = new SessionSearchController(searchSessions)

    await controller.search('   ')

    expect(searchSessions).not.toHaveBeenCalled()
    expect(controller.matches).toEqual([])
    expect(controller.isSearching).toBe(false)
  })

  it('ignores stale slower responses from earlier queries', async () => {
    let resolveSlow: (value: Awaited<ReturnType<SessionSearchController['search']>>) => void = () =>
      undefined
    const searchSessions = vi.fn((request: { query: string }) => {
      if (request.query === 'slow') {
        return new Promise((resolve) => {
          resolveSlow = () =>
            resolve({
              query: 'slow',
              matches: [{ sessionId: 'slow-session', score: 1, reasons: [] }],
            })
        })
      }

      return Promise.resolve({
        query: 'fast',
        matches: [{ sessionId: 'fast-session', score: 2, reasons: [] }],
      })
    })
    const controller = new SessionSearchController(searchSessions)

    const slowSearch = controller.search('slow')
    await controller.search('fast')
    resolveSlow(undefined)
    await slowSearch

    expect(controller.matches.map((match) => match.sessionId)).toEqual(['fast-session'])
    expect(controller.lastQuery).toBe('fast')
  })

  it('clears previous matches immediately when a new query starts', () => {
    const searchSessions = vi.fn(
      () =>
        new Promise((resolve) => {
          setTimeout(() => resolve({ query: 'sdk', matches: [] }), 10)
        }),
    )
    const controller = new SessionSearchController(searchSessions)
    controller.matches = [{ sessionId: 'stale-session', score: 1, reasons: [] }]

    void controller.search('sdk')

    expect(controller.matches).toEqual([])
    expect(controller.isSearching).toBe(true)
  })

  it('coalesces scheduled searches so rapid typing only invokes IPC for the latest query', async () => {
    vi.useFakeTimers()
    const searchSessions = vi.fn((request: { query: string }) =>
      Promise.resolve({
        query: request.query,
        matches: [{ sessionId: `${request.query}-session`, score: 1, reasons: [] }],
      }),
    )
    const controller = new SessionSearchController(searchSessions, { debounceMs: 100 })

    controller.scheduleSearch('a')
    controller.scheduleSearch('au')
    controller.scheduleSearch('auth')

    expect(controller.lastQuery).toBe('auth')
    expect(controller.isSearching).toBe(true)
    expect(searchSessions).not.toHaveBeenCalled()

    await vi.advanceTimersByTimeAsync(99)
    expect(searchSessions).not.toHaveBeenCalled()

    await vi.advanceTimersByTimeAsync(1)

    expect(searchSessions).toHaveBeenCalledTimes(1)
    expect(searchSessions).toHaveBeenCalledWith({ query: 'auth' })
    expect(controller.matches.map((match) => match.sessionId)).toEqual(['auth-session'])

    vi.useRealTimers()
  })

  it('cancels pending scheduled searches when the query is cleared', async () => {
    vi.useFakeTimers()
    const searchSessions = vi.fn()
    const controller = new SessionSearchController(searchSessions, { debounceMs: 100 })
    controller.matches = [{ sessionId: 'stale-session', score: 1, reasons: [] }]

    controller.scheduleSearch('auth')
    controller.scheduleSearch('   ')
    await vi.advanceTimersByTimeAsync(100)

    expect(searchSessions).not.toHaveBeenCalled()
    expect(controller.lastQuery).toBe('')
    expect(controller.matches).toEqual([])
    expect(controller.isSearching).toBe(false)

    vi.useRealTimers()
  })
})
