import { describe, expect, it, vi } from 'vitest'

import { authenticateDaemonConnection } from '../daemon/auth'

describe('authenticateDaemonConnection', () => {
  it('throws when daemon credentials are unavailable', async () => {
    const connection = {
      request: vi.fn(),
    }

    await expect(authenticateDaemonConnection(connection, {})).rejects.toThrow(
      'Daemon authentication credentials are unavailable.',
    )
    expect(connection.request).not.toHaveBeenCalled()
  })

  it('authenticates with resolved daemon credentials', async () => {
    const connection = {
      request: vi.fn().mockResolvedValue({
        userId: 'user-1',
      }),
    }

    await expect(
      authenticateDaemonConnection(connection, {
        getApiKey: () => 'test-api-key',
      }),
    ).resolves.toBeUndefined()

    expect(connection.request).toHaveBeenCalledWith('daemon.authenticate', {
      caller: 'oxox',
      apiKey: 'test-api-key',
    })
  })
})
