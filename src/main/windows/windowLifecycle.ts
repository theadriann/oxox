import type { BrowserWindow } from 'electron'

import { getWindowCloseAction } from './windowClosePolicy'

interface BeforeInputEventLike {
  preventDefault: () => void
}

interface CloseEventLike {
  preventDefault: () => void
}

interface InputLike {
  type: string
  key: string
  meta?: boolean
  control?: boolean
  alt?: boolean
}

interface WebContentsLike {
  on: (
    event: 'before-input-event',
    listener: (event: BeforeInputEventLike, input: InputLike) => void,
  ) => void
}

interface BrowserWindowLike {
  webContents: WebContentsLike
  on: {
    (event: 'focus' | 'move' | 'resize' | 'hide' | 'closed', listener: () => void): void
    (event: 'close', listener: (event: CloseEventLike) => void): void
  }
  hide: () => void
  close: () => void
}

interface CreateWindowLifecycleCoordinatorOptions<TWindow extends BrowserWindowLike> {
  isAppQuitting: () => boolean
  persistOpenWindows: () => void
  getWindowCount: () => number
  getMainWindow: () => TWindow | null
  setMainWindow: (window: TWindow | null) => void
  getLastFocusedWindow: () => TWindow | null
  setLastFocusedWindow: (window: TWindow | null) => void
  findReplacementWindow: (closedWindow: TWindow) => TWindow | null
}

export interface WindowLifecycleCoordinator<TWindow extends BrowserWindowLike> {
  assignPersistenceId: (window: TWindow, id: string) => void
  getPersistenceId: (window: TWindow) => string | undefined
  registerWindowLifecycle: (window: TWindow) => void
}

export function createWindowLifecycleCoordinator<TWindow extends BrowserWindowLike>({
  isAppQuitting,
  persistOpenWindows,
  getWindowCount,
  getMainWindow,
  setMainWindow,
  getLastFocusedWindow,
  setLastFocusedWindow,
  findReplacementWindow,
}: CreateWindowLifecycleCoordinatorOptions<TWindow>): WindowLifecycleCoordinator<TWindow> {
  const commandCloseWindows = new WeakSet<TWindow>()
  const windowPersistenceIds = new WeakMap<TWindow, string>()

  return {
    assignPersistenceId: (window, id) => {
      windowPersistenceIds.set(window, id)
    },
    getPersistenceId: (window) => windowPersistenceIds.get(window),
    registerWindowLifecycle: (window) => {
      let persistTimer: NodeJS.Timeout | undefined

      const schedulePersist = (): void => {
        clearTimeout(persistTimer)
        persistTimer = setTimeout(() => {
          persistOpenWindows()
        }, 150)
      }

      window.on('focus', () => {
        setLastFocusedWindow(window)

        if (!getMainWindow()) {
          setMainWindow(window)
        }
      })

      window.on('move', schedulePersist)
      window.on('resize', schedulePersist)
      window.on('hide', () => {
        persistOpenWindows()
      })

      window.webContents.on('before-input-event', (event, input) => {
        if (input.type !== 'keyDown') {
          return
        }

        const key = input.key.toLowerCase()

        if (input.meta && !input.control && !input.alt && key === 'w') {
          event.preventDefault()
          commandCloseWindows.add(window)
          window.close()
        }
      })

      window.on('close', (event) => {
        commandCloseWindows.delete(window)

        const action = getWindowCloseAction({
          isAppQuitting: isAppQuitting(),
          source: 'system-close',
          windowCount: getWindowCount(),
        })

        if (action === 'hide') {
          event.preventDefault()
          persistOpenWindows()
          window.hide()
          return
        }

        persistOpenWindows()
      })

      window.on('closed', () => {
        clearTimeout(persistTimer)

        if (getMainWindow() === window) {
          setMainWindow(findReplacementWindow(window))
        }

        if (getLastFocusedWindow() === window) {
          setLastFocusedWindow(findReplacementWindow(window))
        }

        persistOpenWindows()
      })
    },
  }
}

export type ElectronWindowLifecycleCoordinator = WindowLifecycleCoordinator<BrowserWindow>
