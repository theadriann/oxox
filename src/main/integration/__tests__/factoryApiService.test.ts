import { describe, expect, it, vi } from 'vitest'

import {
  createEnvironmentFactoryApiAuthProvider,
  createFactoryApiService,
} from '../factoryApi/service'

describe('createFactoryApiService', () => {
  it('passes resolved API keys and base URLs to SDK REST APIs', async () => {
    const computer = {
      id: 'computer-1',
      name: 'devbox',
      providerType: 'byom' as const,
      createdAt: 1,
    }
    const machineTemplate = {
      templateId: 'template-1',
      repoUrl: 'https://github.com/factory/test',
      templateName: 'Template',
      defaultBranch: 'main',
      createdBy: 'factory',
    }
    const sdk = {
      listMachineTemplates: vi.fn().mockResolvedValue({
        templates: [],
        pagination: { hasMore: false, nextCursor: null },
      }),
      getMachineTemplate: vi.fn().mockResolvedValue(machineTemplate),
      listComputers: vi.fn().mockResolvedValue({ computers: [] }),
      getComputer: vi.fn().mockResolvedValue(computer),
      createComputer: vi.fn().mockResolvedValue(computer),
      getComputerByName: vi.fn().mockResolvedValue(computer),
      updateComputer: vi.fn().mockResolvedValue(computer),
      deleteComputer: vi.fn().mockResolvedValue(undefined),
      restartComputer: vi.fn().mockResolvedValue(undefined),
      refreshComputer: vi.fn().mockResolvedValue({ configured: 1 }),
      getComputerMetrics: vi.fn().mockResolvedValue([]),
      retryInstallDeps: vi.fn().mockResolvedValue(computer),
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
    await expect(service.getMachineTemplate({ templateId: 'template-1' })).resolves.toBe(
      machineTemplate,
    )
    await expect(service.listComputers()).resolves.toMatchObject({ computers: [] })
    await expect(service.getComputer({ computerId: 'computer-1' })).resolves.toBe(computer)
    await expect(
      service.createComputer({
        name: 'devbox',
        remoteUser: 'factory',
        repos: ['https://github.com/factory/test'],
      }),
    ).resolves.toBe(computer)
    await expect(service.getComputerByName({ name: 'devbox' })).resolves.toBe(computer)
    await expect(
      service.updateComputer({ computerId: 'computer-1', name: 'renamed' }),
    ).resolves.toBe(computer)
    await expect(service.deleteComputer({ computerId: 'computer-1' })).resolves.toBeUndefined()
    await expect(service.restartComputer({ computerId: 'computer-1' })).resolves.toBeUndefined()
    await expect(service.refreshComputer({ computerId: 'computer-1' })).resolves.toEqual({
      configured: 1,
    })
    await expect(
      service.getComputerMetrics({ computerId: 'computer-1', start: '2026-06-04T00:00:00Z' }),
    ).resolves.toEqual([])
    await expect(service.retryInstallDeps({ computerId: 'computer-1' })).resolves.toBe(computer)
    await expect(service.listRemoteSessions({ computerId: 'computer-1' })).resolves.toMatchObject({
      sessions: [],
    })

    expect(sdk.listMachineTemplates).toHaveBeenCalledWith({
      apiKey: 'factory-key',
      baseUrl: 'https://api.example.test',
      limit: 10,
    })
    expect(sdk.getMachineTemplate).toHaveBeenCalledWith({
      apiKey: 'factory-key',
      baseUrl: 'https://api.example.test',
      templateId: 'template-1',
    })
    expect(sdk.listComputers).toHaveBeenCalledWith({
      apiKey: 'factory-key',
      baseUrl: 'https://api.example.test',
    })
    expect(sdk.getComputer).toHaveBeenCalledWith({
      apiKey: 'factory-key',
      baseUrl: 'https://api.example.test',
      computerId: 'computer-1',
    })
    expect(sdk.createComputer).toHaveBeenCalledWith({
      apiKey: 'factory-key',
      baseUrl: 'https://api.example.test',
      name: 'devbox',
      remoteUser: 'factory',
      repos: ['https://github.com/factory/test'],
    })
    expect(sdk.getComputerByName).toHaveBeenCalledWith({
      apiKey: 'factory-key',
      baseUrl: 'https://api.example.test',
      name: 'devbox',
    })
    expect(sdk.updateComputer).toHaveBeenCalledWith({
      apiKey: 'factory-key',
      baseUrl: 'https://api.example.test',
      computerId: 'computer-1',
      name: 'renamed',
    })
    expect(sdk.deleteComputer).toHaveBeenCalledWith({
      apiKey: 'factory-key',
      baseUrl: 'https://api.example.test',
      computerId: 'computer-1',
    })
    expect(sdk.restartComputer).toHaveBeenCalledWith({
      apiKey: 'factory-key',
      baseUrl: 'https://api.example.test',
      computerId: 'computer-1',
    })
    expect(sdk.refreshComputer).toHaveBeenCalledWith({
      apiKey: 'factory-key',
      baseUrl: 'https://api.example.test',
      computerId: 'computer-1',
    })
    expect(sdk.getComputerMetrics).toHaveBeenCalledWith({
      apiKey: 'factory-key',
      baseUrl: 'https://api.example.test',
      computerId: 'computer-1',
      start: '2026-06-04T00:00:00Z',
    })
    expect(sdk.retryInstallDeps).toHaveBeenCalledWith({
      apiKey: 'factory-key',
      baseUrl: 'https://api.example.test',
      computerId: 'computer-1',
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
