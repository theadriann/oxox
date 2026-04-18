import { describe, expect, it, vi } from 'vitest'

import { IPC_CHANNELS } from '../../shared/ipc/contracts'
import { registerAppIpcHandlers } from '../ipc/router'

function createMockIpcMain() {
  const handlers = new Map<string, (...args: unknown[]) => unknown>()

  return {
    handlers,
    handle: vi.fn((channel: string, handler: (...args: unknown[]) => unknown) => {
      handlers.set(channel, handler)
    }),
    removeHandler: vi.fn((channel: string) => {
      handlers.delete(channel)
    }),
  }
}

describe('registerAppIpcHandlers', () => {
  it('registers the app IPC surface and cleans it up', async () => {
    const ipcMain = createMockIpcMain()
    const service = {
      getBootstrap: vi.fn().mockReturnValue({ ok: true }),
      listProjects: vi.fn().mockReturnValue([{ id: 'project-1' }]),
      listSessions: vi.fn().mockReturnValue([]),
      listSyncMetadata: vi.fn().mockReturnValue([]),
      getSessionTranscript: vi.fn(),
      createSession: vi.fn(),
      getSessionSnapshot: vi.fn(),
      attachSession: vi.fn(),
      detachSession: vi.fn(),
      addUserMessage: vi.fn(),
      renameSession: vi.fn().mockResolvedValue(undefined),
      updateSessionSettings: vi.fn(),
      listSessionTools: vi
        .fn()
        .mockResolvedValue([{ id: 'tool-read', llmId: 'Read', currentlyAllowed: true }]),
      listSessionSkills: vi
        .fn()
        .mockResolvedValue([{ name: 'vault-knowledge', location: 'personal' }]),
      listSessionMcpServers: vi.fn().mockResolvedValue([{ name: 'figma', status: 'connected' }]),
      interruptSession: vi.fn(),
      forkSession: vi.fn(),
      forkSessionViaDaemon: vi.fn().mockResolvedValue({ sessionId: 'session-daemon-fork' }),
      renameSessionViaDaemon: vi.fn().mockResolvedValue(undefined),
      resolvePermissionRequest: vi.fn(),
      resolveAskUserRequest: vi.fn(),
    }
    const updater = {
      getState: vi.fn().mockReturnValue({
        phase: 'idle',
        currentVersion: '0.0.4',
        availableVersion: null,
        downloadedVersion: null,
        progressPercent: null,
        message: null,
        canInstall: false,
      }),
      checkForUpdates: vi.fn().mockResolvedValue({
        phase: 'checking',
        currentVersion: '0.0.4',
        availableVersion: null,
        downloadedVersion: null,
        progressPercent: null,
        message: 'Checking for updates…',
        canInstall: false,
      }),
      installUpdate: vi.fn(),
    }
    const pluginRegistry = {
      listCapabilities: vi.fn().mockReturnValue([
        {
          qualifiedId: 'plugin.example:summarize',
          pluginId: 'plugin.example',
          capability: {
            kind: 'session-action',
            name: 'summarize',
            displayName: 'Summarize Session',
          },
        },
      ]),
    }
    const pluginHost = {
      listHosts: vi.fn().mockReturnValue([{ pluginId: 'plugin.example', status: 'running' }]),
    }
    const invokePluginCapability = vi.fn().mockResolvedValue({
      capabilityId: 'plugin.example:summarize',
      payload: { summary: 'Done' },
    })
    const runtimeInfo = { appVersion: '0.1.0' }

    const cleanup = registerAppIpcHandlers({
      ipcMain,
      service,
      updater,
      pluginRegistry,
      pluginHost,
      invokePluginCapability,
      getRuntimeInfo: () => runtimeInfo,
      createAppWindow: vi.fn(),
      showOpenDialog: vi.fn().mockResolvedValue({ canceled: true, filePaths: [] }),
      resolveOwnerWindow: vi.fn(),
    })

    const handledChannelCount = Object.keys(IPC_CHANNELS).filter(
      (channel) =>
        channel !== 'appNotificationNavigation' &&
        channel !== 'appUpdateStateChanged' &&
        channel !== 'pluginCapabilitiesChanged' &&
        channel !== 'foundationChanged' &&
        channel !== 'sessionSnapshotChanged' &&
        channel !== 'pluginHostChanged',
    ).length

    expect(ipcMain.handle).toHaveBeenCalledTimes(handledChannelCount)
    expect(await ipcMain.handlers.get(IPC_CHANNELS.runtimeInfo)?.()).toBe(runtimeInfo)
    expect(await ipcMain.handlers.get(IPC_CHANNELS.foundationBootstrap)?.()).toEqual({ ok: true })
    expect(await ipcMain.handlers.get(IPC_CHANNELS.appGetUpdateState)?.()).toEqual({
      phase: 'idle',
      currentVersion: '0.0.4',
      availableVersion: null,
      downloadedVersion: null,
      progressPercent: null,
      message: null,
      canInstall: false,
    })
    expect(await ipcMain.handlers.get(IPC_CHANNELS.appCheckForUpdates)?.()).toEqual({
      phase: 'checking',
      currentVersion: '0.0.4',
      availableVersion: null,
      downloadedVersion: null,
      progressPercent: null,
      message: 'Checking for updates…',
      canInstall: false,
    })
    expect(updater.getState).toHaveBeenCalledTimes(1)
    expect(updater.checkForUpdates).toHaveBeenCalledTimes(1)
    expect(await ipcMain.handlers.get(IPC_CHANNELS.pluginListCapabilities)?.()).toEqual([
      {
        qualifiedId: 'plugin.example:summarize',
        pluginId: 'plugin.example',
        kind: 'session-action',
        name: 'summarize',
        displayName: 'Summarize Session',
      },
    ])
    expect(await ipcMain.handlers.get(IPC_CHANNELS.pluginListHosts)?.()).toEqual([
      { pluginId: 'plugin.example', status: 'running' },
    ])
    expect(
      await ipcMain.handlers.get(IPC_CHANNELS.pluginInvokeCapability)?.(
        undefined,
        'plugin.example:summarize',
        {
          sessionId: 'session-1',
        },
      ),
    ).toEqual({
      capabilityId: 'plugin.example:summarize',
      payload: { summary: 'Done' },
    })
    expect(invokePluginCapability).toHaveBeenCalledWith('plugin.example:summarize', {
      sessionId: 'session-1',
    })
    expect(await ipcMain.handlers.get(IPC_CHANNELS.databaseListProjects)?.()).toEqual([
      { id: 'project-1' },
    ])
    await ipcMain.handlers.get(IPC_CHANNELS.sessionRename)?.(undefined, 'session-1', 'Renamed live')
    expect(service.renameSession).toHaveBeenCalledWith('session-1', 'Renamed live')
    expect(
      await ipcMain.handlers.get(IPC_CHANNELS.sessionListTools)?.(undefined, 'session-1'),
    ).toEqual([{ id: 'tool-read', llmId: 'Read', currentlyAllowed: true }])
    expect(
      await ipcMain.handlers.get(IPC_CHANNELS.sessionListSkills)?.(undefined, 'session-1'),
    ).toEqual([{ name: 'vault-knowledge', location: 'personal' }])
    expect(
      await ipcMain.handlers.get(IPC_CHANNELS.sessionListMcpServers)?.(undefined, 'session-1'),
    ).toEqual([{ name: 'figma', status: 'connected' }])
    expect(service.listSessionTools).toHaveBeenCalledWith('session-1')
    expect(service.listSessionSkills).toHaveBeenCalledWith('session-1')
    expect(service.listSessionMcpServers).toHaveBeenCalledWith('session-1')
    expect(
      await ipcMain.handlers.get(IPC_CHANNELS.sessionForkViaDaemon)?.(
        { sender: { id: 42, once: vi.fn() } },
        'session-1',
      ),
    ).toEqual({ sessionId: 'session-daemon-fork' })
    expect(service.forkSessionViaDaemon).toHaveBeenCalledWith('session-1', 'renderer:42')
    await ipcMain.handlers.get(IPC_CHANNELS.sessionRenameViaDaemon)?.(
      undefined,
      'session-1',
      'Renamed',
    )
    expect(service.renameSessionViaDaemon).toHaveBeenCalledWith('session-1', 'Renamed')
    await ipcMain.handlers.get(IPC_CHANNELS.appInstallUpdate)?.()
    expect(updater.installUpdate).toHaveBeenCalledTimes(1)

    cleanup()

    expect(ipcMain.removeHandler).toHaveBeenCalledTimes(handledChannelCount)
    expect(ipcMain.handlers.size).toBe(0)
  })

  it('detaches attached sessions when the renderer is destroyed', async () => {
    const ipcMain = createMockIpcMain()
    let destroyedListener: (() => void) | undefined
    const sender = {
      id: 42,
      once: vi.fn((event: string, listener: () => void) => {
        if (event === 'destroyed') {
          destroyedListener = listener
        }
      }),
    }
    const snapshot = { sessionId: 'session-1' }
    const service = {
      getBootstrap: vi.fn(),
      listProjects: vi.fn(),
      listSessions: vi.fn(),
      listSyncMetadata: vi.fn(),
      getSessionTranscript: vi.fn(),
      createSession: vi.fn().mockResolvedValue(snapshot),
      getSessionSnapshot: vi.fn(),
      attachSession: vi.fn().mockResolvedValue(snapshot),
      detachSession: vi.fn().mockResolvedValue(snapshot),
      addUserMessage: vi.fn(),
      renameSession: vi.fn(),
      updateSessionSettings: vi.fn(),
      listSessionTools: vi.fn(),
      listSessionSkills: vi.fn(),
      listSessionMcpServers: vi.fn(),
      interruptSession: vi.fn(),
      forkSession: vi.fn(),
      forkSessionViaDaemon: vi.fn(),
      renameSessionViaDaemon: vi.fn(),
      resolvePermissionRequest: vi.fn(),
      resolveAskUserRequest: vi.fn(),
    }
    const updater = {
      getState: vi.fn(),
      checkForUpdates: vi.fn(),
      installUpdate: vi.fn(),
    }
    const pluginHost = {
      listHosts: vi.fn().mockReturnValue([]),
    }
    const pluginRegistry = {
      listCapabilities: vi.fn().mockReturnValue([]),
    }
    const invokePluginCapability = vi.fn()

    registerAppIpcHandlers({
      ipcMain,
      service,
      updater,
      pluginRegistry,
      pluginHost,
      invokePluginCapability,
      getRuntimeInfo: vi.fn(),
      createAppWindow: vi.fn(),
      showOpenDialog: vi.fn(),
      resolveOwnerWindow: vi.fn(),
    })

    const createHandler = ipcMain.handlers.get(IPC_CHANNELS.sessionCreate)

    expect(createHandler).toBeDefined()

    await createHandler?.({ sender }, '/tmp/project')
    destroyedListener?.()

    expect(service.createSession).toHaveBeenCalledWith('/tmp/project', 'renderer:42')
    expect(service.detachSession).toHaveBeenCalledWith('session-1', 'renderer:42')
  })

  it('keeps foundation bootstrap readable during shutdown cleanup when requested', async () => {
    const ipcMain = createMockIpcMain()
    const service = {
      getBootstrap: vi.fn().mockReturnValue({ ok: true, phase: 'shutdown-safe' }),
      listProjects: vi.fn().mockReturnValue([]),
      listSessions: vi.fn().mockReturnValue([]),
      listSyncMetadata: vi.fn().mockReturnValue([]),
      getSessionTranscript: vi.fn(),
      createSession: vi.fn(),
      getSessionSnapshot: vi.fn(),
      attachSession: vi.fn(),
      detachSession: vi.fn(),
      addUserMessage: vi.fn(),
      renameSession: vi.fn(),
      updateSessionSettings: vi.fn(),
      listSessionTools: vi.fn(),
      listSessionSkills: vi.fn(),
      listSessionMcpServers: vi.fn(),
      interruptSession: vi.fn(),
      forkSession: vi.fn(),
      forkSessionViaDaemon: vi.fn(),
      renameSessionViaDaemon: vi.fn(),
      resolvePermissionRequest: vi.fn(),
      resolveAskUserRequest: vi.fn(),
    }
    const updater = {
      getState: vi.fn().mockReturnValue({
        phase: 'idle',
        currentVersion: '0.0.4',
        availableVersion: null,
        downloadedVersion: null,
        progressPercent: null,
        message: null,
        canInstall: false,
      }),
      checkForUpdates: vi.fn(),
      installUpdate: vi.fn(),
    }

    const cleanup = registerAppIpcHandlers({
      ipcMain,
      service,
      updater,
      pluginRegistry: { listCapabilities: vi.fn().mockReturnValue([]) },
      pluginHost: { listHosts: vi.fn().mockReturnValue([]) },
      invokePluginCapability: vi.fn(),
      getRuntimeInfo: vi.fn(),
      createAppWindow: vi.fn(),
      showOpenDialog: vi.fn(),
      resolveOwnerWindow: vi.fn(),
      keepBootstrapHandlerOnCleanup: true,
    } as never)

    cleanup()

    expect(await ipcMain.handlers.get(IPC_CHANNELS.foundationBootstrap)?.()).toEqual({
      ok: true,
      phase: 'shutdown-safe',
    })
  })
})
