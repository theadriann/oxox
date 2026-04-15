import { describe, expect, it, vi } from 'vitest'

import { createGracefulQuitController } from '../lifecycle/gracefulQuit'

function createDeferred() {
  let resolve!: () => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<void>((innerResolve, innerReject) => {
    resolve = innerResolve
    reject = innerReject
  })

  return {
    promise,
    reject,
    resolve,
  }
}

describe('createGracefulQuitController', () => {
  it('runs teardown once, marks quitting, and calls quit when cleanup succeeds', async () => {
    const detachActiveSessions = vi.fn().mockResolvedValue(undefined)
    const persistOpenWindows = vi.fn()
    const stopKernel = vi.fn().mockResolvedValue(undefined)
    const quitApp = vi.fn()
    const controller = createGracefulQuitController({
      detachActiveSessions,
      persistOpenWindows,
      stopKernel,
      quitApp,
      onError: vi.fn(),
    })
    const event = {
      preventDefault: vi.fn(),
    }

    controller.handleBeforeQuit(event)
    await Promise.resolve()
    await Promise.resolve()

    expect(event.preventDefault).toHaveBeenCalledTimes(1)
    expect(detachActiveSessions).toHaveBeenCalledTimes(1)
    expect(persistOpenWindows).toHaveBeenCalledTimes(1)
    expect(stopKernel).toHaveBeenCalledTimes(1)
    expect(quitApp).toHaveBeenCalledTimes(1)
    expect(controller.isQuitting()).toBe(true)
  })

  it('ignores repeated before-quit events while cleanup is already in flight', async () => {
    const deferred = createDeferred()
    const detachActiveSessions = vi.fn().mockReturnValue(deferred.promise)
    const controller = createGracefulQuitController({
      detachActiveSessions,
      persistOpenWindows: vi.fn(),
      stopKernel: vi.fn().mockResolvedValue(undefined),
      quitApp: vi.fn(),
      onError: vi.fn(),
    })
    const event = {
      preventDefault: vi.fn(),
    }

    controller.handleBeforeQuit(event)
    controller.handleBeforeQuit(event)

    expect(detachActiveSessions).toHaveBeenCalledTimes(1)
    expect(event.preventDefault).toHaveBeenCalledTimes(2)

    deferred.resolve()
    await Promise.resolve()
    await Promise.resolve()
  })

  it('marks the app as quitting before async cleanup finishes so explicit quits can close windows', () => {
    const deferred = createDeferred()
    const controller = createGracefulQuitController({
      detachActiveSessions: vi.fn().mockReturnValue(deferred.promise),
      persistOpenWindows: vi.fn(),
      stopKernel: vi.fn().mockResolvedValue(undefined),
      quitApp: vi.fn(),
      onError: vi.fn(),
    })
    const event = {
      preventDefault: vi.fn(),
    }

    controller.handleBeforeQuit(event)

    expect(event.preventDefault).toHaveBeenCalledTimes(1)
    expect(controller.isQuitting()).toBe(true)
  })

  it('reports cleanup failures, resets in-flight state, and allows retry', async () => {
    const onError = vi.fn()
    const detachActiveSessions = vi
      .fn()
      .mockRejectedValueOnce(new Error('detach failed'))
      .mockResolvedValueOnce(undefined)
    const quitApp = vi.fn()
    const controller = createGracefulQuitController({
      detachActiveSessions,
      persistOpenWindows: vi.fn(),
      stopKernel: vi.fn().mockResolvedValue(undefined),
      quitApp,
      onError,
    })
    const event = {
      preventDefault: vi.fn(),
    }

    controller.handleBeforeQuit(event)
    await Promise.resolve()
    await Promise.resolve()

    expect(onError).toHaveBeenCalledWith(expect.any(Error))
    expect(controller.isQuitting()).toBe(false)
    expect(quitApp).not.toHaveBeenCalled()

    controller.handleBeforeQuit(event)
    await Promise.resolve()
    await Promise.resolve()

    expect(detachActiveSessions).toHaveBeenCalledTimes(2)
    expect(quitApp).toHaveBeenCalledTimes(1)
    expect(controller.isQuitting()).toBe(true)
  })

  it('does not intercept the event after quitting has already begun', () => {
    const controller = createGracefulQuitController({
      detachActiveSessions: vi.fn().mockResolvedValue(undefined),
      persistOpenWindows: vi.fn(),
      stopKernel: vi.fn().mockResolvedValue(undefined),
      quitApp: vi.fn(),
      onError: vi.fn(),
    })
    const event = {
      preventDefault: vi.fn(),
    }

    controller.markQuitting()
    controller.handleBeforeQuit(event)

    expect(event.preventDefault).not.toHaveBeenCalled()
  })
})
