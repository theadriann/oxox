import { describe, expect, it, vi } from 'vitest'

import { discoverReachableDaemonPort } from '../daemon/portDiscovery'

describe('discoverReachableDaemonPort', () => {
  it('tries candidate ports in order until one succeeds', async () => {
    const tryPort = vi
      .fn<(_: number) => Promise<void>>()
      .mockRejectedValueOnce(new Error('ECONNREFUSED'))
      .mockResolvedValueOnce(undefined)

    await expect(
      discoverReachableDaemonPort({
        resolveCandidatePorts: async () => [37643, 58051],
        tryPort,
      }),
    ).resolves.toEqual({
      connectedPort: 58051,
      lastError: null,
    })

    expect(tryPort).toHaveBeenCalledTimes(2)
    expect(tryPort).toHaveBeenNthCalledWith(1, 37643)
    expect(tryPort).toHaveBeenNthCalledWith(2, 58051)
  })

  it('returns the last error when no candidate port succeeds', async () => {
    const tryPort = vi
      .fn<(_: number) => Promise<void>>()
      .mockRejectedValueOnce(new Error('ECONNREFUSED'))
      .mockRejectedValueOnce(new Error('socket closed'))

    const result = await discoverReachableDaemonPort({
      resolveCandidatePorts: async () => [37643, 58051],
      tryPort,
    })

    expect(result.connectedPort).toBeNull()
    expect(result.lastError).toBeInstanceOf(Error)
    expect(result.lastError?.message).toBe('socket closed')
  })
})
