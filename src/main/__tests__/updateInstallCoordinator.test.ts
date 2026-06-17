import { describe, expect, it, vi } from 'vitest'

import { createUpdateInstallCoordinator } from '../updater/updateInstallCoordinator'

describe('createUpdateInstallCoordinator', () => {
  it('delegates update state and checks to the updater', async () => {
    const state = {
      phase: 'idle' as const,
      currentVersion: '0.0.4',
      availableVersion: null,
      downloadedVersion: null,
      progressPercent: null,
      message: null,
      canInstall: false,
    }
    const updater = {
      getState: vi.fn(() => state),
      checkForUpdates: vi.fn().mockResolvedValue(state),
      installDownloadedUpdate: vi.fn(),
    }
    const coordinator = createUpdateInstallCoordinator({
      updater,
      requestQuit: vi.fn(),
    })

    expect(coordinator.getState()).toBe(state)
    await expect(coordinator.checkForUpdates()).resolves.toBe(state)
    expect(updater.checkForUpdates).toHaveBeenCalledTimes(1)
  })

  it('requests graceful quit before installing a downloaded update', () => {
    const updater = {
      getState: vi.fn(() => ({
        phase: 'downloaded' as const,
        currentVersion: '0.0.4',
        availableVersion: '0.0.5',
        downloadedVersion: '0.0.5',
        progressPercent: 100,
        message: 'Restart to install update.',
        canInstall: true,
      })),
      checkForUpdates: vi.fn(),
      installDownloadedUpdate: vi.fn(),
    }
    const requestQuit = vi.fn()
    const coordinator = createUpdateInstallCoordinator({ updater, requestQuit })

    coordinator.installUpdate()

    expect(requestQuit).toHaveBeenCalledTimes(1)
    expect(updater.installDownloadedUpdate).not.toHaveBeenCalled()

    const finalize = requestQuit.mock.calls[0]?.[0]
    finalize?.()

    expect(updater.installDownloadedUpdate).toHaveBeenCalledTimes(1)
  })

  it('does not request quit when no update is ready to install', () => {
    const updater = {
      getState: vi.fn(() => ({
        phase: 'checking' as const,
        currentVersion: '0.0.4',
        availableVersion: null,
        downloadedVersion: null,
        progressPercent: null,
        message: 'Checking for updates…',
        canInstall: false,
      })),
      checkForUpdates: vi.fn(),
      installDownloadedUpdate: vi.fn(),
    }
    const requestQuit = vi.fn()
    const coordinator = createUpdateInstallCoordinator({ updater, requestQuit })

    coordinator.installUpdate()

    expect(requestQuit).not.toHaveBeenCalled()
    expect(updater.installDownloadedUpdate).not.toHaveBeenCalled()
  })
})
