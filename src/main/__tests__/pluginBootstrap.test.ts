import { describe, expect, it, vi } from 'vitest'

import { startPluginBootstrap } from '../app/pluginBootstrap'

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

describe('startPluginBootstrap', () => {
  it('starts plugin loading without blocking the caller and notifies on success', async () => {
    const deferred = createDeferred<void>()
    const appKernel = {
      loadPlugins: vi.fn().mockReturnValue(deferred.promise),
    }
    const onCapabilitiesChanged = vi.fn()

    const bootstrapPromise = startPluginBootstrap({
      appKernel,
      onCapabilitiesChanged,
      onError: vi.fn(),
    })

    expect(appKernel.loadPlugins).toHaveBeenCalledTimes(1)
    expect(onCapabilitiesChanged).not.toHaveBeenCalled()

    deferred.resolve(undefined)
    await bootstrapPromise

    expect(onCapabilitiesChanged).toHaveBeenCalledTimes(1)
    expect(onCapabilitiesChanged).toHaveBeenCalledWith(
      expect.objectContaining({
        refreshedAt: expect.any(String),
      }),
    )
  })

  it('swallows plugin bootstrap failures after reporting them', async () => {
    const error = new Error('plugin load failed')
    const onError = vi.fn()

    await expect(
      startPluginBootstrap({
        appKernel: {
          loadPlugins: vi.fn().mockRejectedValue(error),
        },
        onCapabilitiesChanged: vi.fn(),
        onError,
      }),
    ).resolves.toBeUndefined()

    expect(onError).toHaveBeenCalledWith(error)
  })
})
