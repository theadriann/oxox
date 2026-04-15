import { EventEmitter } from 'node:events'
import { describe, expect, it, vi } from 'vitest'

import type { AppUpdateState } from '../../shared/ipc/contracts'
import { createAppUpdater } from '../updater/appUpdater'

class MockAutoUpdater extends EventEmitter {
  autoDownload = false
  autoInstallOnAppQuit = true
  readonly checkForUpdates = vi.fn().mockResolvedValue(undefined)
  readonly quitAndInstall = vi.fn()
}

describe('createAppUpdater', () => {
  it('marks automatic updates unsupported for unpackaged runs', async () => {
    const updater = new MockAutoUpdater()
    const states: AppUpdateState[] = []
    const service = createAppUpdater({
      appVersion: '0.0.4',
      autoUpdater: updater,
      isPackaged: false,
      onStateChanged: (state) => {
        states.push(state)
      },
    })

    const state = await service.start()

    expect(updater.checkForUpdates).not.toHaveBeenCalled()
    expect(state).toMatchObject({
      phase: 'unsupported',
      canInstall: false,
      currentVersion: '0.0.4',
    })
    expect(service.getState()).toEqual(state)
    expect(states.at(-1)).toEqual(state)
  })

  it('starts a silent background check and tracks download lifecycle events', async () => {
    const updater = new MockAutoUpdater()
    const states: AppUpdateState[] = []
    const service = createAppUpdater({
      appVersion: '0.0.4',
      autoUpdater: updater,
      isPackaged: true,
      onStateChanged: (state) => {
        states.push(state)
      },
    })

    await service.start()

    expect(updater.autoDownload).toBe(true)
    expect(updater.autoInstallOnAppQuit).toBe(false)
    expect(updater.checkForUpdates).toHaveBeenCalledTimes(1)

    updater.emit('checking-for-update')
    expect(service.getState().phase).toBe('checking')

    updater.emit('update-available', { version: '0.0.5' })
    expect(service.getState()).toMatchObject({
      phase: 'downloading',
      availableVersion: '0.0.5',
      message: 'Downloading update…',
    })

    updater.emit('download-progress', { percent: 42.3 })
    expect(service.getState()).toMatchObject({
      phase: 'downloading',
      progressPercent: 42,
    })

    updater.emit('update-downloaded', { version: '0.0.5' })
    expect(service.getState()).toMatchObject({
      phase: 'downloaded',
      canInstall: true,
      downloadedVersion: '0.0.5',
      message: 'Restart to install update.',
    })
    expect(states.at(-1)?.phase).toBe('downloaded')
  })

  it('supports manual checks and restart installation', async () => {
    const updater = new MockAutoUpdater()
    const service = createAppUpdater({
      appVersion: '0.0.4',
      autoUpdater: updater,
      isPackaged: true,
    })

    await service.start()
    await service.checkForUpdates()
    updater.emit('update-downloaded', { version: '0.0.5' })
    service.installUpdate()

    expect(updater.checkForUpdates).toHaveBeenCalledTimes(2)
    expect(updater.quitAndInstall).toHaveBeenCalledWith(false, true)
  })

  it('captures updater errors in a serializable state snapshot', async () => {
    const updater = new MockAutoUpdater()
    const service = createAppUpdater({
      appVersion: '0.0.4',
      autoUpdater: updater,
      isPackaged: true,
    })

    await service.start()
    updater.emit('error', new Error('Network offline'))

    expect(service.getState()).toMatchObject({
      phase: 'error',
      canInstall: false,
      message: 'Network offline',
    })
  })
})
