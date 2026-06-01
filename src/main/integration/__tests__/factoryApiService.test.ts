import { describe, expect, it, vi } from 'vitest'

import {
  createEnvironmentFactoryApiAuthProvider,
  createFactoryApiService,
} from '../factoryApi/service'

describe('createFactoryApiService', () => {
  it('passes resolved API keys and base URLs to non-daemon SDK REST APIs', async () => {
    const sdk = {
      listMachineTemplates: vi.fn().mockResolvedValue({
        templates: [],
        pagination: { hasMore: false, nextCursor: null },
      }),
      listComputers: vi.fn().mockResolvedValue({ computers: [] }),
      listRemoteSessions: vi.fn().mockResolvedValue({
        sessions: [],
        pagination: { hasMore: false, nextCursor: null },
      }),
    }
    const service = createFactoryApiService({
      authProvider: { getApiKey: () => 'factory-key' },
      baseUrl: 'https://api.example.test',
      sdk,
    })

    await expect(service.listMachineTemplates({ limit: 10 })).resolves.toMatchObject({
      templates: [],
    })
    await expect(service.listComputers()).resolves.toMatchObject({ computers: [] })
    await expect(service.listRemoteSessions({ computerId: 'computer-1' })).resolves.toMatchObject({
      sessions: [],
    })

    expect(sdk.listMachineTemplates).toHaveBeenCalledWith({
      apiKey: 'factory-key',
      baseUrl: 'https://api.example.test',
      limit: 10,
    })
    expect(sdk.listComputers).toHaveBeenCalledWith({
      apiKey: 'factory-key',
      baseUrl: 'https://api.example.test',
    })
    expect(sdk.listRemoteSessions).toHaveBeenCalledWith({
      apiKey: 'factory-key',
      baseUrl: 'https://api.example.test',
      computerId: 'computer-1',
    })
  })

  it('uses OXOX environment API key precedence without exposing tokens', () => {
    const provider = createEnvironmentFactoryApiAuthProvider({
      FACTORY_API_KEY: 'factory-key',
      DROID_API_KEY: 'droid-key',
      DAEMON_API_KEY: 'daemon-key',
      FACTORY_ACCESS_TOKEN: 'access-token',
    })

    expect(provider.getApiKey()).toBe('factory-key')
  })

  it('rejects calls when no Factory API key is available', async () => {
    const service = createFactoryApiService({
      authProvider: { getApiKey: () => undefined },
      sdk: {
        listComputers: vi.fn(),
      },
    })

    await expect(service.listComputers()).rejects.toThrow('Factory API key is unavailable.')
  })
})
