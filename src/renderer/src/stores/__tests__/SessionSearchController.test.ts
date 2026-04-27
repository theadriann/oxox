import { describe, expect, it, vi } from 'vitest'

import { SessionSearchController } from '../SessionSearchController'

describe('SessionSearchController', () => {
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
})
