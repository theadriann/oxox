import type { Rectangle } from 'electron'

import {
  createWindowStateEntry,
  createWindowStateSnapshot,
  DEFAULT_WINDOW_STATE_ID,
  type WindowStateEntry,
  type WindowStateSnapshot,
} from './windowState'

export interface RestoredWindowState {
  id: string
  bounds?: Partial<Rectangle>
}

export const DEFAULT_RESTORED_WINDOW: RestoredWindowState = {
  id: DEFAULT_WINDOW_STATE_ID,
}

interface WindowStateCoordinatorWindowLike {
  isDestroyed: () => boolean
  isMinimized: () => boolean
  getBounds: () => Rectangle
  getNormalBounds: () => Rectangle
}

interface CreateWindowStateCoordinatorOptions<TWindow extends WindowStateCoordinatorWindowLike> {
  defaultWindowId?: string
  getStatePath: () => string
  getWindows: () => TWindow[]
  loadSnapshot: (filePath: string) => WindowStateSnapshot | undefined
  saveSnapshot: (filePath: string, snapshot: WindowStateSnapshot) => void
}

export interface WindowStateCoordinator<TWindow extends WindowStateCoordinatorWindowLike> {
  assignPersistenceId: (window: TWindow, id: string) => void
  getPersistenceId: (window: TWindow) => string
  persistOpenWindows: () => void
  resolveInitialWindows: () => RestoredWindowState[]
}

export function createWindowStateCoordinator<TWindow extends WindowStateCoordinatorWindowLike>({
  defaultWindowId = DEFAULT_WINDOW_STATE_ID,
  getStatePath,
  getWindows,
  loadSnapshot,
  saveSnapshot,
}: CreateWindowStateCoordinatorOptions<TWindow>): WindowStateCoordinator<TWindow> {
  const windowPersistenceIds = new WeakMap<TWindow, string>()

  const getPersistenceId = (window: TWindow): string =>
    windowPersistenceIds.get(window) ?? defaultWindowId

  const toPersistedWindowState = (window: TWindow): WindowStateEntry | null => {
    if (window.isDestroyed()) {
      return null
    }

    return createWindowStateEntry(
      getPersistenceId(window),
      window.isMinimized() ? window.getNormalBounds() : window.getBounds(),
    )
  }

  return {
    assignPersistenceId: (window, id) => {
      windowPersistenceIds.set(window, id)
    },
    getPersistenceId,
    persistOpenWindows: () => {
      const windows = getWindows()
        .filter((window) => !window.isDestroyed())
        .map((window) => toPersistedWindowState(window))
        .filter((window): window is WindowStateEntry => window !== null)

      if (windows.length === 0) {
        return
      }

      saveSnapshot(getStatePath(), createWindowStateSnapshot(windows))
    },
    resolveInitialWindows: () => {
      const snapshot = loadSnapshot(getStatePath())

      if (!snapshot || snapshot.windows.length === 0) {
        return [{ id: defaultWindowId }]
      }

      return snapshot.windows.map((window) => ({
        id: window.id,
        bounds: window.bounds,
      }))
    },
  }
}
