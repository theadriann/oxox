import { describe, expect, it, vi } from 'vitest'

import {
  createWindowStateCoordinator,
  DEFAULT_RESTORED_WINDOW,
} from '../windows/windowStateCoordinator'

class FakeWindow {
  destroyed = false

  constructor(
    private readonly bounds: { x: number; y: number; width: number; height: number },
    private readonly normalBounds = bounds,
    private readonly minimized = false,
  ) {}

  isDestroyed(): boolean {
    return this.destroyed
  }

  isMinimized(): boolean {
    return this.minimized
  }

  getBounds() {
    return this.bounds
  }

  getNormalBounds() {
    return this.normalBounds
  }
}

describe('createWindowStateCoordinator', () => {
  it('restores persisted windows and falls back to the default restored window', () => {
    const loadSnapshot = vi
      .fn()
      .mockReturnValueOnce({
        windows: [
          {
            id: 'window-alpha',
            bounds: { x: 20, y: 30, width: 1200, height: 800 },
          },
        ],
      })
      .mockReturnValueOnce(undefined)
    const coordinator = createWindowStateCoordinator<FakeWindow>({
      defaultWindowId: 'window-1',
      getStatePath: () => '/tmp/window-state.json',
      getWindows: () => [],
      loadSnapshot,
      saveSnapshot: vi.fn(),
    })

    expect(coordinator.resolveInitialWindows()).toEqual([
      {
        id: 'window-alpha',
        bounds: { x: 20, y: 30, width: 1200, height: 800 },
      },
    ])
    expect(coordinator.resolveInitialWindows()).toEqual([DEFAULT_RESTORED_WINDOW])
  })

  it('tracks persistence ids and saves all open non-destroyed windows', () => {
    const firstWindow = new FakeWindow({ x: 10, y: 20, width: 1000, height: 700 })
    const secondWindow = new FakeWindow(
      { x: 0, y: 0, width: 10, height: 10 },
      { x: 30, y: 40, width: 1200, height: 900 },
      true,
    )
    const saveSnapshot = vi.fn()
    const coordinator = createWindowStateCoordinator<FakeWindow>({
      defaultWindowId: 'window-1',
      getStatePath: () => '/tmp/window-state.json',
      getWindows: () => [firstWindow, secondWindow],
      loadSnapshot: vi.fn(),
      saveSnapshot,
    })

    coordinator.assignPersistenceId(firstWindow, 'window-alpha')

    coordinator.persistOpenWindows()

    expect(saveSnapshot).toHaveBeenCalledWith('/tmp/window-state.json', {
      windows: [
        {
          id: 'window-alpha',
          bounds: { x: 10, y: 20, width: 1000, height: 700 },
        },
        {
          id: 'window-1',
          bounds: { x: 30, y: 40, width: 1200, height: 900 },
        },
      ],
    })
  })
})
