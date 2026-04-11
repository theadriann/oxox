import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { createWindowLifecycleCoordinator } from '../windows/windowLifecycle'

type WindowListener = (...args: unknown[]) => void

class FakeWebContents {
  private readonly listeners = new Map<string, WindowListener[]>()

  on(event: string, listener: WindowListener): this {
    this.listeners.set(event, [...(this.listeners.get(event) ?? []), listener])
    return this
  }

  emit(event: string, ...args: unknown[]): void {
    for (const listener of this.listeners.get(event) ?? []) {
      listener(...args)
    }
  }
}

class FakeWindow {
  readonly webContents = new FakeWebContents()
  private readonly listeners = new Map<string, WindowListener[]>()
  hide = vi.fn()
  close = vi.fn()
  destroyed = false

  on(event: string, listener: WindowListener): this {
    this.listeners.set(event, [...(this.listeners.get(event) ?? []), listener])
    return this
  }

  emit(event: string, ...args: unknown[]): void {
    for (const listener of this.listeners.get(event) ?? []) {
      listener(...args)
    }
  }

  isDestroyed(): boolean {
    return this.destroyed
  }
}

describe('createWindowLifecycleCoordinator', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('tracks focused windows and promotes the first focused window to main', () => {
    let mainWindow: FakeWindow | null = null
    let lastFocusedWindow: FakeWindow | null = null
    const window = new FakeWindow()
    const coordinator = createWindowLifecycleCoordinator({
      isAppQuitting: () => false,
      persistOpenWindows: vi.fn(),
      getWindowCount: () => 1,
      getMainWindow: () => mainWindow,
      setMainWindow: (value) => {
        mainWindow = value
      },
      getLastFocusedWindow: () => lastFocusedWindow,
      setLastFocusedWindow: (value) => {
        lastFocusedWindow = value
      },
      findReplacementWindow: () => null,
    })

    coordinator.registerWindowLifecycle(window)
    window.emit('focus')

    expect(mainWindow).toBe(window)
    expect(lastFocusedWindow).toBe(window)
  })

  it('hides a single window on close when the app is not quitting', () => {
    const window = new FakeWindow()
    const persistOpenWindows = vi.fn()
    const coordinator = createWindowLifecycleCoordinator({
      isAppQuitting: () => false,
      persistOpenWindows,
      getWindowCount: () => 1,
      getMainWindow: () => null,
      setMainWindow: vi.fn(),
      getLastFocusedWindow: () => null,
      setLastFocusedWindow: vi.fn(),
      findReplacementWindow: () => null,
    })

    coordinator.registerWindowLifecycle(window)
    const event = {
      preventDefault: vi.fn(),
    }

    window.emit('close', event)

    expect(event.preventDefault).toHaveBeenCalledTimes(1)
    expect(window.hide).toHaveBeenCalledTimes(1)
    expect(persistOpenWindows).toHaveBeenCalledTimes(1)
  })

  it('intercepts Cmd+W and forwards it to close()', () => {
    const window = new FakeWindow()
    const coordinator = createWindowLifecycleCoordinator({
      isAppQuitting: () => false,
      persistOpenWindows: vi.fn(),
      getWindowCount: () => 2,
      getMainWindow: () => null,
      setMainWindow: vi.fn(),
      getLastFocusedWindow: () => null,
      setLastFocusedWindow: vi.fn(),
      findReplacementWindow: () => null,
    })

    coordinator.registerWindowLifecycle(window)
    const event = {
      preventDefault: vi.fn(),
    }

    window.webContents.emit('before-input-event', event, {
      type: 'keyDown',
      key: 'w',
      meta: true,
      control: false,
      alt: false,
    })

    expect(event.preventDefault).toHaveBeenCalledTimes(1)
    expect(window.close).toHaveBeenCalledTimes(1)
  })

  it('debounces persistence on move and resize, but persists immediately on hide and closed', () => {
    let lastFocusedWindow: FakeWindow | null = null
    let mainWindow: FakeWindow | null = null
    const replacementWindow = new FakeWindow()
    const window = new FakeWindow()
    const persistOpenWindows = vi.fn()
    const coordinator = createWindowLifecycleCoordinator({
      isAppQuitting: () => false,
      persistOpenWindows,
      getWindowCount: () => 2,
      getMainWindow: () => mainWindow,
      setMainWindow: (value) => {
        mainWindow = value
      },
      getLastFocusedWindow: () => lastFocusedWindow,
      setLastFocusedWindow: (value) => {
        lastFocusedWindow = value
      },
      findReplacementWindow: () => replacementWindow,
    })

    coordinator.registerWindowLifecycle(window)
    coordinator.registerWindowLifecycle(replacementWindow)
    mainWindow = window
    lastFocusedWindow = window

    window.emit('move')
    window.emit('resize')
    expect(persistOpenWindows).toHaveBeenCalledTimes(0)

    vi.advanceTimersByTime(149)
    expect(persistOpenWindows).toHaveBeenCalledTimes(0)

    vi.advanceTimersByTime(1)
    expect(persistOpenWindows).toHaveBeenCalledTimes(1)

    window.emit('hide')
    expect(persistOpenWindows).toHaveBeenCalledTimes(2)

    window.emit('closed')
    expect(persistOpenWindows).toHaveBeenCalledTimes(3)
    expect(mainWindow).toBe(replacementWindow)
    expect(lastFocusedWindow).toBe(replacementWindow)
  })
})
