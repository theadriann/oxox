import { describe, expect, it, vi } from 'vitest'

import type { AppUpdateState } from '../../../../../shared/ipc/contracts'
import { UpdateStore } from '../UpdateStore'

function createUpdateState(overrides: Partial<AppUpdateState> = {}): AppUpdateState {
  return {
    phase: 'idle',
    currentVersion: '0.0.4',
    availableVersion: null,
    downloadedVersion: null,
    progressPercent: null,
    message: null,
    canInstall: false,
    ...overrides,
  }
}

describe('UpdateStore', () => {
  it('hydrates update state through injected app APIs', async () => {
    const getUpdateState = vi.fn().mockResolvedValue(
      createUpdateState({
        phase: 'checking',
        message: 'Checking for updates…',
      }),
    )
    const store = new UpdateStore({
      getUpdateState,
    })

    await store.refresh()

    expect(getUpdateState).toHaveBeenCalledTimes(1)
    expect(store.state).toEqual(
      createUpdateState({
        phase: 'checking',
        message: 'Checking for updates…',
      }),
    )
    expect(store.hasLoadedState).toBe(true)
    expect(store.statusLabel).toBe('Checking for updates…')
  })

  it('tracks restart-ready prompt state and lets the user dismiss it until a new download arrives', async () => {
    const store = new UpdateStore({})

    store.applySnapshot(
      createUpdateState({
        phase: 'downloaded',
        availableVersion: '0.0.5',
        downloadedVersion: '0.0.5',
        progressPercent: 100,
        message: 'Restart to install update.',
        canInstall: true,
      }),
    )

    expect(store.shouldShowPrompt).toBe(true)
    expect(store.statusLabel).toBe('Update ready')

    store.dismissPrompt()

    expect(store.shouldShowPrompt).toBe(false)

    store.applySnapshot(
      createUpdateState({
        phase: 'downloaded',
        availableVersion: '0.0.6',
        downloadedVersion: '0.0.6',
        progressPercent: 100,
        message: 'Restart to install update.',
        canInstall: true,
      }),
    )

    expect(store.shouldShowPrompt).toBe(true)
  })

  it('delegates manual checks and install actions through injected app APIs', async () => {
    const checkForUpdates = vi.fn().mockResolvedValue(
      createUpdateState({
        phase: 'checking',
        message: 'Checking for updates…',
      }),
    )
    const installUpdate = vi.fn().mockResolvedValue(undefined)
    const store = new UpdateStore({
      checkForUpdates,
      installUpdate,
    })

    await store.checkForUpdates()
    await store.installUpdate()

    expect(checkForUpdates).toHaveBeenCalledTimes(1)
    expect(installUpdate).toHaveBeenCalledTimes(1)
    expect(store.state.phase).toBe('checking')
  })

  it('captures refresh failures without throwing away the existing snapshot', async () => {
    const getUpdateState = vi
      .fn()
      .mockResolvedValueOnce(createUpdateState())
      .mockRejectedValueOnce(new Error('Update service unavailable'))
    const store = new UpdateStore({
      getUpdateState,
    })

    await store.refresh()
    await store.refresh()

    expect(store.state).toEqual(createUpdateState())
    expect(store.refreshError).toBe('Update service unavailable')
  })
})
