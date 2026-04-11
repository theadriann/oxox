import { describe, expect, it, vi } from 'vitest'

import { IPC_CHANNELS } from '../../shared/ipc/contracts'
import { createWindowCoordinator } from '../windows/windowCoordinator'

type EventListener = (...args: unknown[]) => void

class FakeWebContents {
  readonly sent: Array<{ channel: string; payload: unknown }> = []
  readonly openExternalHandler = vi.fn()
  readonly listeners = new Map<string, EventListener[]>()
  readonly setWindowOpenHandler = vi.fn()
  readonly openDevTools = vi.fn()
  currentUrl = 'app://window'

  on(event: string, listener: EventListener): this {
    this.listeners.set(event, [...(this.listeners.get(event) ?? []), listener])
    return this
  }

  emit(event: string, ...args: unknown[]): void {
    for (const listener of this.listeners.get(event) ?? []) {
      listener(...args)
    }
  }

  getURL(): string {
    return this.currentUrl
  }

  send(channel: string, payload: unknown): void {
    this.sent.push({ channel, payload })
  }
}

class FakeWindow {
  readonly webContents = new FakeWebContents()
  readonly listeners = new Map<string, EventListener[]>()
  readonly onceListeners = new Map<string, EventListener[]>()
  readonly show = vi.fn()
  destroyed = false

  once(event: string, listener: EventListener): this {
    this.onceListeners.set(event, [...(this.onceListeners.get(event) ?? []), listener])
    return this
  }

  on(event: string, listener: EventListener): this {
    this.listeners.set(event, [...(this.listeners.get(event) ?? []), listener])
    return this
  }

  emit(event: string, ...args: unknown[]): void {
    for (const listener of this.listeners.get(event) ?? []) {
      listener(...args)
    }

    const onceListeners = this.onceListeners.get(event) ?? []
    this.onceListeners.delete(event)
    for (const listener of onceListeners) {
      listener(...args)
    }
  }

  isDestroyed(): boolean {
    return this.destroyed
  }
}

describe('createWindowCoordinator', () => {
  it('creates a window, registers external navigation guards, persists state, and loads the renderer URL with the window id', async () => {
    let mainWindow: FakeWindow | null = null
    let lastFocusedWindow: FakeWindow | null = null
    const window = new FakeWindow()
    const loadWindowUrl = vi.fn().mockResolvedValue(undefined)
    const registerWindowLifecycle = vi.fn()
    const persistOpenWindows = vi.fn()
    const coordinator = createWindowCoordinator<FakeWindow>({
      createBrowserWindow: vi.fn(() => window),
      loadWindowUrl,
      openExternal: vi.fn(),
      registerWindowLifecycle,
      persistOpenWindows,
      getMainWindow: () => mainWindow,
      setMainWindow: (value) => {
        mainWindow = value
      },
      getLastFocusedWindow: () => lastFocusedWindow,
      setLastFocusedWindow: (value) => {
        lastFocusedWindow = value
      },
      getAllWindows: () => [window],
      focusWindow: vi.fn(),
      preloadPath: '/tmp/preload.js',
      restoredWindowIdToUrl: (windowId) => `http://localhost:5173/?windowId=${windowId}`,
      openDevToolsInDevelopment: true,
    })

    await coordinator.createAppWindow({ id: 'window-alpha' })

    expect(loadWindowUrl).toHaveBeenCalledWith(
      window,
      'http://localhost:5173/?windowId=window-alpha',
    )
    expect(registerWindowLifecycle).toHaveBeenCalledWith(window)
    expect(persistOpenWindows).toHaveBeenCalledTimes(1)
    expect(mainWindow).toBe(window)
    expect(lastFocusedWindow).toBe(window)
    expect(window.webContents.setWindowOpenHandler).toHaveBeenCalledTimes(1)
    expect(window.webContents.listeners.has('will-navigate')).toBe(true)

    window.emit('ready-to-show')

    expect(window.show).toHaveBeenCalledTimes(1)
    expect(window.webContents.openDevTools).toHaveBeenCalledWith({ mode: 'detach' })
  })

  it('reuses the last focused window when showing the app instead of creating a new one', async () => {
    const focusedWindow = new FakeWindow()
    const focusWindow = vi.fn()
    const coordinator = createWindowCoordinator<FakeWindow>({
      createBrowserWindow: vi.fn(),
      loadWindowUrl: vi.fn(),
      openExternal: vi.fn(),
      registerWindowLifecycle: vi.fn(),
      persistOpenWindows: vi.fn(),
      getMainWindow: () => focusedWindow,
      setMainWindow: vi.fn(),
      getLastFocusedWindow: () => focusedWindow,
      setLastFocusedWindow: vi.fn(),
      getAllWindows: () => [focusedWindow],
      focusWindow,
      preloadPath: '/tmp/preload.js',
      restoredWindowIdToUrl: (windowId) => `app://window?windowId=${windowId}`,
      openDevToolsInDevelopment: false,
    })

    const result = await coordinator.showOxoxWindow()

    expect(result).toBe(focusedWindow)
    expect(focusWindow).toHaveBeenCalledWith(focusedWindow)
  })

  it('navigates from notifications by focusing a window and sending the session id payload', async () => {
    const window = new FakeWindow()
    const coordinator = createWindowCoordinator<FakeWindow>({
      createBrowserWindow: vi.fn(),
      loadWindowUrl: vi.fn(),
      openExternal: vi.fn(),
      registerWindowLifecycle: vi.fn(),
      persistOpenWindows: vi.fn(),
      getMainWindow: () => window,
      setMainWindow: vi.fn(),
      getLastFocusedWindow: () => window,
      setLastFocusedWindow: vi.fn(),
      getAllWindows: () => [window],
      focusWindow: vi.fn(),
      preloadPath: '/tmp/preload.js',
      restoredWindowIdToUrl: (windowId) => `app://window?windowId=${windowId}`,
      openDevToolsInDevelopment: false,
    })

    await coordinator.navigateToSessionFromNotification('session-live-1')

    expect(window.webContents.sent).toEqual([
      {
        channel: IPC_CHANNELS.appNotificationNavigation,
        payload: { sessionId: 'session-live-1' },
      },
    ])
  })
})
