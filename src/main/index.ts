import { randomUUID } from 'node:crypto'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { app, BrowserWindow, dialog, ipcMain, nativeTheme, session, shell } from 'electron'
import { IPC_CHANNELS } from '../shared/ipc/contracts'
import { AppKernel } from './app/AppKernel'
import { startPluginBootstrap } from './app/pluginBootstrap'
import { startRuntimeCoordinator } from './app/runtimeCoordinator'
import { createFoundationService } from './integration/foundationService'
import { loadLocalPluginsFromRoot } from './integration/plugins/localPluginCatalog'
import { detachActiveSessions } from './integration/sessionRegistry'
import { isRendererAttachedToSession } from './ipc/liveSessionAttachmentRegistry'
import { registerAppIpcHandlers } from './ipc/router'
import { createGracefulQuitController } from './lifecycle/gracefulQuit'
import { focusMainWindow } from './lifecycle/singleInstance'
import { installSystemIntegration } from './native/systemIntegration'
import { getRuntimeInfo } from './runtime/runtimeInfo'
import { getContentSecurityPolicy } from './security/csp'
import { buildMainWindowOptions } from './windows/mainWindow'
import { createWindowCoordinator } from './windows/windowCoordinator'
import { createWindowLifecycleCoordinator } from './windows/windowLifecycle'
import { loadWindowState, saveWindowState } from './windows/windowState'
import { createWindowStateCoordinator } from './windows/windowStateCoordinator'

const currentDirectory = dirname(fileURLToPath(import.meta.url))
const APP_NAME = 'OXOX'
const APP_ID = 'oxox'

if (app.getName().toLowerCase() !== APP_ID) {
  app.setPath('userData', join(app.getPath('appData'), APP_ID))
}

nativeTheme.themeSource = 'dark'
let mainWindow: BrowserWindow | null = null
let lastFocusedWindow: BrowserWindow | null = null
let appKernel: AppKernel | null = null
let stopRuntimeCoordinator: (() => void) | null = null
const gracefulQuitController = createGracefulQuitController({
  detachActiveSessions,
  persistOpenWindows: () => windowStateCoordinator.persistOpenWindows(),
  stopKernel: async () => {
    stopRuntimeCoordinator?.()
    stopRuntimeCoordinator = null
    await appKernel?.stopAsync()
    appKernel = null
  },
  quitApp: () => {
    app.quit()
  },
  onError: (error) => {
    console.error('Graceful quit failed', error)
  },
})
const windowLifecycleCoordinator = createWindowLifecycleCoordinator<BrowserWindow>({
  isAppQuitting: () => gracefulQuitController.isQuitting(),
  persistOpenWindows: () => windowStateCoordinator.persistOpenWindows(),
  getWindowCount: () => BrowserWindow.getAllWindows().length,
  getMainWindow: () => mainWindow,
  setMainWindow: (window) => {
    mainWindow = window
  },
  getLastFocusedWindow: () => lastFocusedWindow,
  setLastFocusedWindow: (window) => {
    lastFocusedWindow = window
  },
  findReplacementWindow: (closedWindow) =>
    BrowserWindow.getAllWindows().find((candidate) => candidate !== closedWindow) ?? null,
})
const windowStateCoordinator = createWindowStateCoordinator<BrowserWindow>({
  getStatePath: () => join(app.getPath('userData'), 'window-state.json'),
  getWindows: () => BrowserWindow.getAllWindows(),
  loadSnapshot: (filePath) => loadWindowState(filePath),
  saveSnapshot: (filePath, snapshot) => saveWindowState(filePath, snapshot),
})
const preloadPath = join(currentDirectory, '../preload/index.js')
const windowCoordinator = createWindowCoordinator<BrowserWindow>({
  assignPersistenceId: (window, id) => windowStateCoordinator.assignPersistenceId(window, id),
  createBrowserWindow: (restoredWindowState = { id: randomUUID() }) =>
    new BrowserWindow(buildMainWindowOptions(preloadPath, restoredWindowState.bounds)),
  loadWindowUrl: (window, url) => window.loadURL(url),
  openExternal: (url) => {
    void shell.openExternal(url)
  },
  registerWindowLifecycle: (window) => windowLifecycleCoordinator.registerWindowLifecycle(window),
  persistOpenWindows: () => windowStateCoordinator.persistOpenWindows(),
  getMainWindow: () => mainWindow,
  setMainWindow: (window) => {
    mainWindow = window
  },
  getLastFocusedWindow: () => lastFocusedWindow,
  setLastFocusedWindow: (window) => {
    lastFocusedWindow = window
  },
  getAllWindows: () => BrowserWindow.getAllWindows(),
  focusWindow: (window) => focusMainWindow(window),
  restoredWindowIdToUrl: (windowId) => {
    if (process.env.ELECTRON_RENDERER_URL) {
      const rendererUrl = new URL(process.env.ELECTRON_RENDERER_URL)
      rendererUrl.searchParams.set('windowId', windowId)
      return rendererUrl.toString()
    }

    const rendererUrl = pathToFileURL(join(currentDirectory, '../renderer/index.html'))
    rendererUrl.searchParams.set('windowId', windowId)
    return rendererUrl.toString()
  },
  openDevToolsInDevelopment: Boolean(process.env.ELECTRON_RENDERER_URL),
  preloadPath,
})

const hasSingleInstanceLock = app.requestSingleInstanceLock()

if (!hasSingleInstanceLock) {
  app.quit()
}

function registerSecurityHeaders(): void {
  const contentSecurityPolicy = getContentSecurityPolicy(Boolean(process.env.ELECTRON_RENDERER_URL))

  const applyPolicy = (targetSession: Electron.Session): void => {
    targetSession.webRequest.onHeadersReceived((details, callback) => {
      callback({
        responseHeaders: {
          ...details.responseHeaders,
          'Content-Security-Policy': [contentSecurityPolicy],
        },
      })
    })
  }

  applyPolicy(session.defaultSession)
  app.on('session-created', applyPolicy)
}

function broadcastFoundationChanged(payload: { refreshedAt: string }): void {
  for (const window of BrowserWindow.getAllWindows()) {
    if (window.isDestroyed()) {
      continue
    }

    window.webContents.send(IPC_CHANNELS.foundationChanged, payload)
  }
}

function createLiveSessionSnapshotBroadcaster(
  getSessionSnapshot: (sessionId: string) => unknown,
): (payload: { sessionId: string }) => void {
  return ({ sessionId }) => {
    const subscribedWindows = BrowserWindow.getAllWindows().filter(
      (window) =>
        !window.isDestroyed() && isRendererAttachedToSession(window.webContents.id, sessionId),
    )

    if (subscribedWindows.length === 0) {
      return
    }

    const snapshot = getSessionSnapshot(sessionId)

    if (!snapshot) {
      return
    }

    for (const window of subscribedWindows) {
      window.webContents.send(IPC_CHANNELS.sessionSnapshotChanged, { snapshot })
    }
  }
}

function broadcastPluginHostSnapshot(payload: { snapshot: unknown }): void {
  for (const window of BrowserWindow.getAllWindows()) {
    if (window.isDestroyed()) {
      continue
    }

    window.webContents.send(IPC_CHANNELS.pluginHostChanged, payload)
  }
}

function broadcastPluginCapabilitiesChanged(payload: { refreshedAt: string }): void {
  for (const window of BrowserWindow.getAllWindows()) {
    if (window.isDestroyed()) {
      continue
    }

    window.webContents.send(IPC_CHANNELS.pluginCapabilitiesChanged, payload)
  }
}

function isAppInBackground(): boolean {
  const windows = BrowserWindow.getAllWindows().filter((window) => !window.isDestroyed())

  if (windows.length === 0) {
    return true
  }

  return windows.every(
    (window) => !window.isVisible() || window.isMinimized() || !window.isFocused(),
  )
}

if (hasSingleInstanceLock) {
  app.on('second-instance', () => {
    focusMainWindow(lastFocusedWindow ?? mainWindow)
  })
}

app.whenReady().then(async () => {
  appKernel ??= new AppKernel({
    userDataPath: app.getPath('userData'),
    createFoundationService,
    loadLocalPlugins: ({ pluginRegistry, userDataPath }) =>
      loadLocalPluginsFromRoot({
        pluginRegistry,
        pluginsRoot: join(userDataPath, 'plugins'),
      }),
    registerSecurityHeaders,
    registerIpcHandlers: (service) => {
      const pluginRegistry = appKernel?.getPluginRegistry()
      const pluginHost = appKernel?.getPluginHost()

      if (!pluginRegistry || !pluginHost) {
        throw new Error('App kernel unavailable during IPC registration.')
      }

      return registerAppIpcHandlers({
        ipcMain,
        service,
        keepBootstrapHandlerOnCleanup: true,
        pluginRegistry,
        pluginHost,
        invokePluginCapability: (capabilityId, payload) =>
          appKernel.invokePluginCapability(capabilityId, payload),
        getRuntimeInfo,
        createAppWindow: () => windowCoordinator.createAppWindow({ id: randomUUID() }),
        showOpenDialog: (ownerWindow, options) => dialog.showOpenDialog(ownerWindow, options),
        resolveOwnerWindow: (sender) => BrowserWindow.fromWebContents(sender) ?? undefined,
      })
    },
    installSystemIntegration: (service) =>
      installSystemIntegration({
        appName: APP_NAME,
        foundationService: service,
        platform: process.platform,
        setAppName: (name) => app.setName(name),
        setDockIcon: (icon) => app.dock.setIcon(icon),
        isAppInBackground,
        onOpenNewWindow: () => {
          void windowCoordinator.createAppWindow({
            id: randomUUID(),
          })
        },
        onShowWindow: () => {
          void windowCoordinator.showOxoxWindow()
        },
        onQuit: () => {
          app.quit()
        },
        onNavigateToSession: (sessionId) => {
          void windowCoordinator.navigateToSessionFromNotification(sessionId)
        },
      }),
  })
  const foundationService = appKernel.start()
  const broadcastLiveSessionSnapshot = createLiveSessionSnapshotBroadcaster((sessionId) =>
    foundationService.getSessionSnapshot(sessionId),
  )
  stopRuntimeCoordinator?.()
  stopRuntimeCoordinator = startRuntimeCoordinator({
    foundationService,
    pluginHost: appKernel.getPluginHost(),
    broadcastFoundationChanged,
    broadcastLiveSessionSnapshot,
    broadcastPluginHostSnapshot,
    startPluginBootstrap: () => {
      void startPluginBootstrap({
        appKernel,
        onCapabilitiesChanged: (payload) => {
          broadcastPluginCapabilitiesChanged(payload)
        },
        onError: (error) => {
          console.error('Failed to load local plugins during startup', error)
        },
      })
    },
  })
  for (const windowState of windowStateCoordinator.resolveInitialWindows()) {
    await windowCoordinator.createAppWindow(windowState)
  }

  app.on('activate', async () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      await windowCoordinator.createAppWindow({ id: randomUUID() })
      return
    }

    focusMainWindow(lastFocusedWindow ?? mainWindow)
  })
})

app.on('before-quit', (event) => {
  gracefulQuitController.handleBeforeQuit(event)
})

app.on('window-all-closed', () => {
  // Intentionally left blank so the tray can keep the app alive on macOS.
})

app.on('will-quit', () => {
  gracefulQuitController.markQuitting()
  stopRuntimeCoordinator?.()
  stopRuntimeCoordinator = null
  appKernel = null
})
