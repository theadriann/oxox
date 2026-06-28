import { describe, expect, it, vi } from 'vitest'

import { AppKernel } from '../app/AppKernel'
import { ServiceRegistry } from '../app/ServiceRegistry'

function createDeferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((innerResolve, innerReject) => {
    resolve = innerResolve
    reject = innerReject
  })

  return {
    promise,
    reject,
    resolve,
  }
}

describe('AppKernel', () => {
  it('starts once and wires foundation services into the composition lifecycle', () => {
    const foundationService = { close: vi.fn() }
    const createFoundationService = vi.fn().mockReturnValue(foundationService)
    const registerSecurityHeaders = vi.fn()
    const registerIpcHandlers = vi.fn().mockReturnValue(vi.fn())
    const installSystemIntegration = vi.fn().mockReturnValue(vi.fn())
    const serviceRegistry = new ServiceRegistry()
    const kernel = new AppKernel({
      userDataPath: '/tmp/oxox',
      createFoundationService,
      registerSecurityHeaders,
      registerIpcHandlers,
      installSystemIntegration,
      serviceRegistry,
    })

    const firstStart = kernel.start()
    const secondStart = kernel.start()

    expect(firstStart).toBe(foundationService)
    expect(secondStart).toBe(foundationService)
    expect(createFoundationService).toHaveBeenCalledTimes(1)
    expect(registerSecurityHeaders).toHaveBeenCalledTimes(1)
    expect(registerIpcHandlers).toHaveBeenCalledWith(foundationService)
    expect(installSystemIntegration).toHaveBeenCalledWith(foundationService)
    expect(kernel.getFoundationService()).toBe(foundationService)
    expect(serviceRegistry.has('plugins')).toBe(true)
  })

  it('disposes integration hooks and the registered foundation service on stop', async () => {
    const foundationService = { close: vi.fn() }
    const ipcCleanup = vi.fn()
    const systemCleanup = vi.fn()
    const pluginHost = {
      registerPlugins: vi.fn(),
      startAll: vi.fn().mockResolvedValue(undefined),
      invokeCapability: vi.fn(),
      dispose: vi.fn().mockResolvedValue(undefined),
    }
    const kernel = new AppKernel({
      userDataPath: '/tmp/oxox',
      createFoundationService: vi.fn().mockReturnValue(foundationService),
      registerSecurityHeaders: vi.fn(),
      registerIpcHandlers: vi.fn().mockReturnValue(ipcCleanup),
      installSystemIntegration: vi.fn().mockReturnValue(systemCleanup),
      pluginHost,
    })

    kernel.start()
    await kernel.stopAsync()

    expect(ipcCleanup).toHaveBeenCalledTimes(1)
    expect(systemCleanup).toHaveBeenCalledTimes(1)
    expect(foundationService.close).toHaveBeenCalledTimes(1)
    expect(pluginHost.dispose).toHaveBeenCalledTimes(1)
    expect(() => kernel.getFoundationService()).toThrow('App kernel has not been started yet.')
  })

  it('loads local plugins through the kernel-owned registry exactly once', async () => {
    const loadLocalPlugins = vi.fn().mockResolvedValue({
      loadedPlugins: [],
      issues: [],
    })
    const pluginHost = {
      registerPlugins: vi.fn(),
      startAll: vi.fn().mockResolvedValue(undefined),
      dispose: vi.fn().mockResolvedValue(undefined),
    }
    const kernel = new AppKernel({
      userDataPath: '/tmp/oxox',
      createFoundationService: vi.fn().mockReturnValue({ close: vi.fn() }),
      registerSecurityHeaders: vi.fn(),
      registerIpcHandlers: vi.fn(),
      installSystemIntegration: vi.fn(),
      loadLocalPlugins,
      pluginHost,
    })

    const firstReport = await kernel.loadPlugins()
    const secondReport = await kernel.loadPlugins()

    expect(firstReport).toEqual({
      loadedPlugins: [],
      issues: [],
    })
    expect(secondReport).toBe(firstReport)
    expect(loadLocalPlugins).toHaveBeenCalledTimes(1)
    expect(loadLocalPlugins).toHaveBeenCalledWith({
      pluginRegistry: kernel.getPluginRegistry(),
      userDataPath: '/tmp/oxox',
    })
    expect(pluginHost.registerPlugins).toHaveBeenCalledWith([])
    expect(pluginHost.startAll).toHaveBeenCalledTimes(1)
  })

  it('disposes the plugin host during kernel shutdown', () => {
    const pluginHost = {
      registerPlugins: vi.fn(),
      startAll: vi.fn().mockResolvedValue(undefined),
      dispose: vi.fn().mockResolvedValue(undefined),
    }
    const kernel = new AppKernel({
      userDataPath: '/tmp/oxox',
      createFoundationService: vi.fn().mockReturnValue({ close: vi.fn() }),
      registerSecurityHeaders: vi.fn(),
      registerIpcHandlers: vi.fn(),
      installSystemIntegration: vi.fn(),
      pluginHost,
    })

    kernel.stop()

    expect(pluginHost.dispose).toHaveBeenCalledTimes(1)
  })

  it('awaits asynchronous plugin host disposal before resolving stopAsync', async () => {
    let resolveDispose!: () => void
    const pluginHost = {
      registerPlugins: vi.fn(),
      startAll: vi.fn().mockResolvedValue(undefined),
      invokeCapability: vi.fn(),
      dispose: vi.fn().mockImplementation(
        () =>
          new Promise<void>((resolve) => {
            resolveDispose = resolve
          }),
      ),
    }
    const kernel = new AppKernel({
      userDataPath: '/tmp/oxox',
      createFoundationService: vi.fn().mockReturnValue({ close: vi.fn() }),
      registerSecurityHeaders: vi.fn(),
      registerIpcHandlers: vi.fn(),
      installSystemIntegration: vi.fn(),
      pluginHost,
    })

    kernel.start()
    const stopPromise = kernel.stopAsync()

    expect(pluginHost.dispose).toHaveBeenCalledTimes(1)

    let resolved = false
    void stopPromise.then(() => {
      resolved = true
    })
    await Promise.resolve()
    expect(resolved).toBe(false)

    resolveDispose()
    await stopPromise

    expect(resolved).toBe(true)
  })

  it('does not register or start plugin hosts if plugin loading resolves after shutdown begins', async () => {
    const deferredLoad = createDeferred<{
      loadedPlugins: []
      issues: []
    }>()
    const pluginHost = {
      registerPlugins: vi.fn(),
      startAll: vi.fn().mockResolvedValue(undefined),
      invokeCapability: vi.fn(),
      dispose: vi.fn().mockResolvedValue(undefined),
    }
    const kernel = new AppKernel({
      userDataPath: '/tmp/oxox',
      createFoundationService: vi.fn().mockReturnValue({ close: vi.fn() }),
      registerSecurityHeaders: vi.fn(),
      registerIpcHandlers: vi.fn(),
      installSystemIntegration: vi.fn(),
      loadLocalPlugins: vi.fn().mockReturnValue(deferredLoad.promise),
      pluginHost,
    })

    const loadPromise = kernel.loadPlugins()
    await kernel.stopAsync()
    deferredLoad.resolve({
      loadedPlugins: [],
      issues: [],
    })

    await expect(loadPromise).resolves.toEqual({
      loadedPlugins: [],
      issues: [],
    })
    expect(pluginHost.registerPlugins).not.toHaveBeenCalled()
    expect(pluginHost.startAll).not.toHaveBeenCalled()
  })

  it('validates plugin capability invocations through the kernel before delegating to the host', async () => {
    const pluginHost = {
      registerPlugins: vi.fn(),
      startAll: vi.fn().mockResolvedValue(undefined),
      invokeCapability: vi.fn().mockResolvedValue({
        capabilityId: 'plugin.example:summarize',
        payload: { summary: 'Done' },
      }),
      dispose: vi.fn().mockResolvedValue(undefined),
    }
    const kernel = new AppKernel({
      userDataPath: '/tmp/oxox',
      createFoundationService: vi.fn().mockReturnValue({ close: vi.fn() }),
      registerSecurityHeaders: vi.fn(),
      registerIpcHandlers: vi.fn(),
      installSystemIntegration: vi.fn(),
      pluginHost,
    })

    kernel.getPluginRegistry().register({
      id: 'plugin.example',
      displayName: 'Example Plugin',
      version: '1.0.0',
      entryPoint: './dist/index.js',
      capabilities: [
        {
          kind: 'session-action',
          name: 'summarize',
          displayName: 'Summarize Session',
        },
      ],
      sandbox: {
        kind: 'node-process',
        permissions: ['session:read'],
      },
    })

    await expect(
      kernel.invokePluginCapability('plugin.example:summarize', {
        sessionId: 'session-1',
      }),
    ).resolves.toEqual({
      capabilityId: 'plugin.example:summarize',
      payload: { summary: 'Done' },
    })
    expect(pluginHost.invokeCapability).toHaveBeenCalledWith('plugin.example:summarize', {
      sessionId: 'session-1',
    })
  })

  it('rejects session-action capability invocations without a session id payload', async () => {
    const pluginHost = {
      registerPlugins: vi.fn(),
      startAll: vi.fn().mockResolvedValue(undefined),
      invokeCapability: vi.fn(),
      dispose: vi.fn().mockResolvedValue(undefined),
    }
    const kernel = new AppKernel({
      userDataPath: '/tmp/oxox',
      createFoundationService: vi.fn().mockReturnValue({ close: vi.fn() }),
      registerSecurityHeaders: vi.fn(),
      registerIpcHandlers: vi.fn(),
      installSystemIntegration: vi.fn(),
      pluginHost,
    })

    kernel.getPluginRegistry().register({
      id: 'plugin.example',
      displayName: 'Example Plugin',
      version: '1.0.0',
      entryPoint: './dist/index.js',
      capabilities: [
        {
          kind: 'session-action',
          name: 'summarize',
          displayName: 'Summarize Session',
        },
      ],
      sandbox: {
        kind: 'node-process',
        permissions: ['session:read'],
      },
    })

    await expect(kernel.invokePluginCapability('plugin.example:summarize')).rejects.toThrow(
      'Session-action capability "plugin.example:summarize" requires a payload with a sessionId.',
    )
    expect(pluginHost.invokeCapability).not.toHaveBeenCalled()
  })

  it('rejects capability invocations when the plugin manifest lacks the required permission', async () => {
    const pluginHost = {
      registerPlugins: vi.fn(),
      startAll: vi.fn().mockResolvedValue(undefined),
      invokeCapability: vi.fn(),
      dispose: vi.fn().mockResolvedValue(undefined),
    }
    const kernel = new AppKernel({
      userDataPath: '/tmp/oxox',
      createFoundationService: vi.fn().mockReturnValue({ close: vi.fn() }),
      registerSecurityHeaders: vi.fn(),
      registerIpcHandlers: vi.fn(),
      installSystemIntegration: vi.fn(),
      pluginHost,
    })

    kernel.getPluginRegistry().register({
      id: 'plugin.example',
      displayName: 'Example Plugin',
      version: '1.0.0',
      entryPoint: './dist/index.js',
      capabilities: [
        {
          kind: 'session-action',
          name: 'summarize',
          displayName: 'Summarize Session',
        },
      ],
      sandbox: {
        kind: 'node-process',
        permissions: [],
      },
    })

    await expect(
      kernel.invokePluginCapability('plugin.example:summarize', {
        sessionId: 'session-1',
      }),
    ).rejects.toThrow(
      'Plugin "plugin.example" is not allowed to invoke "plugin.example:summarize"; missing permission "session:read".',
    )
    expect(pluginHost.invokeCapability).not.toHaveBeenCalled()
  })
})
