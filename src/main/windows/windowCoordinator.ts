import { IPC_CHANNELS } from '../../shared/ipc/contracts'

interface BrowserWindowLike {
  webContents: {
    setWindowOpenHandler: (handler: ({ url }: { url: string }) => { action: 'deny' }) => void
    on: (
      event: 'will-navigate',
      listener: (event: { preventDefault: () => void }, url: string) => void,
    ) => void
    getURL: () => string
    send: (channel: string, payload: unknown) => void
    openDevTools: (options: { mode: 'detach' }) => void
  }
  once: (event: 'ready-to-show', listener: () => void) => void
  show: () => void
  isDestroyed: () => boolean
}

export interface CreateWindowCoordinatorOptions<TWindow extends BrowserWindowLike> {
  assignPersistenceId?: (window: TWindow, id: string) => void
  createBrowserWindow: (restoredWindowState?: { id: string; bounds?: unknown }) => TWindow
  loadWindowUrl: (window: TWindow, url: string) => Promise<void>
  openExternal: (url: string) => void
  registerWindowLifecycle: (window: TWindow) => void
  persistOpenWindows: () => void
  getMainWindow: () => TWindow | null
  setMainWindow: (window: TWindow | null) => void
  getLastFocusedWindow: () => TWindow | null
  setLastFocusedWindow: (window: TWindow | null) => void
  getAllWindows: () => TWindow[]
  focusWindow: (window: TWindow | null) => void
  restoredWindowIdToUrl: (windowId: string) => string
  openDevToolsInDevelopment: boolean
  preloadPath: string
}

export interface WindowCoordinator<TWindow extends BrowserWindowLike> {
  createAppWindow: (restoredWindowState?: { id: string; bounds?: unknown }) => Promise<TWindow>
  showOxoxWindow: () => Promise<TWindow>
  navigateToSessionFromNotification: (sessionId: string) => Promise<void>
}

export function createWindowCoordinator<TWindow extends BrowserWindowLike>({
  assignPersistenceId,
  createBrowserWindow,
  loadWindowUrl,
  openExternal,
  registerWindowLifecycle,
  persistOpenWindows,
  getMainWindow,
  setMainWindow,
  getLastFocusedWindow,
  setLastFocusedWindow,
  getAllWindows,
  focusWindow,
  restoredWindowIdToUrl,
  openDevToolsInDevelopment,
}: CreateWindowCoordinatorOptions<TWindow>): WindowCoordinator<TWindow> {
  const createAppWindow = async (
    restoredWindowState: { id: string; bounds?: unknown } = { id: 'window-1' },
  ): Promise<TWindow> => {
    const window = createBrowserWindow(restoredWindowState)
    assignPersistenceId?.(window, restoredWindowState.id)

    window.webContents.setWindowOpenHandler(({ url }) => {
      openExternal(url)
      return { action: 'deny' }
    })
    window.webContents.on('will-navigate', (event, url) => {
      if (url === window.webContents.getURL()) {
        return
      }

      event.preventDefault()
      openExternal(url)
    })

    registerWindowLifecycle(window)
    persistOpenWindows()

    window.once('ready-to-show', () => {
      window.show()
      persistOpenWindows()

      if (openDevToolsInDevelopment) {
        window.webContents.openDevTools({ mode: 'detach' })
      }
    })

    await loadWindowUrl(window, restoredWindowIdToUrl(restoredWindowState.id))

    if (!getMainWindow() || getMainWindow()?.isDestroyed()) {
      setMainWindow(window)
    }

    setLastFocusedWindow(window)
    return window
  }

  const showOxoxWindow = async (): Promise<TWindow> => {
    const lastFocusedWindow = getLastFocusedWindow()
    const candidate =
      (lastFocusedWindow && !lastFocusedWindow.isDestroyed() ? lastFocusedWindow : null) ??
      getAllWindows().find((window) => !window.isDestroyed()) ??
      (await createAppWindow())

    focusWindow(candidate)
    return candidate
  }

  return {
    createAppWindow,
    showOxoxWindow,
    navigateToSessionFromNotification: async (sessionId) => {
      const window = await showOxoxWindow()

      if (window.isDestroyed()) {
        return
      }

      window.webContents.send(IPC_CHANNELS.appNotificationNavigation, {
        sessionId,
      })
    },
  }
}
