import { describe, expect, it, vi } from 'vitest'

import { IPC_CHANNELS } from '../../shared/ipc/contracts'
import { createOxoxBridge } from '../bridge'

describe('createOxoxBridge', () => {
  it('invokes the runtime info channel through the typed bridge', async () => {
    const invoke = vi.fn().mockResolvedValue({
      appVersion: '0.1.0',
      chromeVersion: '1',
      electronVersion: '1',
      nodeVersion: '1',
      platform: 'darwin',
      isDarkModeForced: true,
      hasRequire: false,
      hasProcess: false,
    })

    const bridge = createOxoxBridge(invoke)
    const result = await bridge.runtime.getInfo()

    expect(invoke).toHaveBeenCalledWith(IPC_CHANNELS.runtimeInfo)
    expect(result.isDarkModeForced).toBe(true)
  })

  it('exposes foundation and database IPC methods through the typed bridge', async () => {
    const invoke = vi.fn((channel: string) => {
      switch (channel) {
        case IPC_CHANNELS.foundationBootstrap:
          return Promise.resolve({
            database: {
              exists: true,
              journalMode: 'wal',
              path: '/tmp/oxox.db',
              tableNames: ['projects', 'sessions', 'sync_metadata'],
            },
            droidCli: {
              available: true,
              path: '/Users/test/.local/bin/droid',
              version: 'droid 0.84.0',
              searchedLocations: ['/Users/test/.local/bin/droid'],
              error: null,
            },
            daemon: {
              status: 'connected',
              connectedPort: 37643,
              lastError: null,
              lastConnectedAt: '2026-03-24T22:00:00.000Z',
              lastSyncAt: '2026-03-24T22:00:01.000Z',
              nextRetryDelayMs: null,
            },
            projects: [],
            sessions: [],
            syncMetadata: [],
            factoryModels: [
              {
                id: 'claude-3.7',
                name: 'Claude 3.7 Sonnet',
                provider: 'anthropic',
              },
            ],
            factoryDefaultSettings: {
              model: 'claude-3.7',
              interactionMode: 'spec',
            },
          })
        case IPC_CHANNELS.databaseListProjects:
        case IPC_CHANNELS.databaseListSessions:
        case IPC_CHANNELS.databaseListSyncMetadata:
          return Promise.resolve([])
        case IPC_CHANNELS.pluginListHosts:
          return Promise.resolve([
            {
              pluginId: 'plugin.example',
              processId: 4242,
              status: 'running',
              lastError: null,
            },
          ])
        case IPC_CHANNELS.pluginListCapabilities:
          return Promise.resolve([
            {
              qualifiedId: 'plugin.example:summarize',
              pluginId: 'plugin.example',
              kind: 'session-action',
              name: 'summarize',
              displayName: 'Summarize Session',
            },
          ])
        case IPC_CHANNELS.pluginInvokeCapability:
          return Promise.resolve({
            capabilityId: 'plugin.example:summarize',
            payload: {
              summary: 'Done',
            },
          })
        case IPC_CHANNELS.appGetUpdateState:
          return Promise.resolve({
            phase: 'idle',
            currentVersion: '0.0.4',
            availableVersion: null,
            downloadedVersion: null,
            progressPercent: null,
            message: null,
            canInstall: false,
          })
        case IPC_CHANNELS.appCheckForUpdates:
          return Promise.resolve({
            phase: 'checking',
            currentVersion: '0.0.4',
            availableVersion: null,
            downloadedVersion: null,
            progressPercent: null,
            message: 'Checking for updates…',
            canInstall: false,
          })
        case IPC_CHANNELS.sessionCreate:
        case IPC_CHANNELS.sessionAttach:
        case IPC_CHANNELS.sessionGetSnapshot:
        case IPC_CHANNELS.sessionDetach:
        case IPC_CHANNELS.sessionFork:
        case IPC_CHANNELS.sessionForkViaDaemon:
          return Promise.resolve({
            sessionId: 'session-live-1',
            title: 'Live session',
            status: 'active',
            transport: 'stream-jsonrpc',
            processId: 4242,
            viewerCount: 1,
            projectWorkspacePath: '/tmp/live',
            parentSessionId: null,
            availableModels: [
              { id: 'gpt-5.4', name: 'GPT 5.4' },
              { id: 'gpt-5.4-mini', name: 'GPT 5.4 Mini' },
            ],
            settings: {
              modelId: 'gpt-5.4',
              interactionMode: 'auto',
            },
            messages: [],
            events: [],
          })
        case IPC_CHANNELS.dialogSelectDirectory:
          return Promise.resolve('/tmp/live-session')
        case IPC_CHANNELS.sessionAddUserMessage:
        case IPC_CHANNELS.sessionUpdateSettings:
        case IPC_CHANNELS.sessionRenameViaDaemon:
        case IPC_CHANNELS.appInstallUpdate:
          return Promise.resolve(undefined)
        case IPC_CHANNELS.sessionInterrupt:
        case IPC_CHANNELS.appOpenWindow:
          return Promise.resolve(undefined)
        default:
          return Promise.reject(new Error(`Unexpected channel ${channel}`))
      }
    })

    const bridge = createOxoxBridge(invoke as never)
    const bootstrap = await bridge.foundation.getBootstrap()

    expect(bootstrap.droidCli.available).toBe(true)
    expect(bootstrap.factoryModels).toEqual([
      {
        id: 'claude-3.7',
        name: 'Claude 3.7 Sonnet',
        provider: 'anthropic',
      },
    ])
    expect(bootstrap.factoryDefaultSettings).toEqual({
      model: 'claude-3.7',
      interactionMode: 'spec',
    })
    await expect(bridge.database.listProjects()).resolves.toEqual([])
    await expect(bridge.database.listSessions()).resolves.toEqual([])
    await expect(bridge.database.listSyncMetadata()).resolves.toEqual([])
    await expect(bridge.plugin?.listCapabilities()).resolves.toEqual([
      {
        qualifiedId: 'plugin.example:summarize',
        pluginId: 'plugin.example',
        kind: 'session-action',
        name: 'summarize',
        displayName: 'Summarize Session',
      },
    ])
    await expect(bridge.plugin?.listHosts()).resolves.toEqual([
      {
        pluginId: 'plugin.example',
        processId: 4242,
        status: 'running',
        lastError: null,
      },
    ])
    await expect(
      bridge.plugin?.invokeCapability('plugin.example:summarize', {
        sessionId: 'session-1',
      }),
    ).resolves.toEqual({
      capabilityId: 'plugin.example:summarize',
      payload: {
        summary: 'Done',
      },
    })
    await expect(bridge.app?.getUpdateState()).resolves.toEqual({
      phase: 'idle',
      currentVersion: '0.0.4',
      availableVersion: null,
      downloadedVersion: null,
      progressPercent: null,
      message: null,
      canInstall: false,
    })
    await expect(bridge.app?.checkForUpdates()).resolves.toEqual({
      phase: 'checking',
      currentVersion: '0.0.4',
      availableVersion: null,
      downloadedVersion: null,
      progressPercent: null,
      message: 'Checking for updates…',
      canInstall: false,
    })
    expect(bridge.plugin?.onCapabilitiesChanged).toBeTypeOf('function')
    await expect(bridge.session.create('/tmp/live')).resolves.toMatchObject({
      sessionId: 'session-live-1',
      status: 'active',
    })
    await expect(bridge.session.getSnapshot('session-live-1')).resolves.toMatchObject({
      sessionId: 'session-live-1',
      status: 'active',
    })
    await expect(bridge.session.attach('session-live-1')).resolves.toMatchObject({
      sessionId: 'session-live-1',
      status: 'active',
    })
    await expect(bridge.session.detach('session-live-1')).resolves.toMatchObject({
      sessionId: 'session-live-1',
      status: 'active',
    })
    await expect(bridge.session.addUserMessage('session-live-1', 'hello')).resolves.toBeUndefined()
    await expect(
      bridge.session.updateSettings('session-live-1', {
        modelId: 'gpt-5.4-mini',
        interactionMode: 'spec',
      }),
    ).resolves.toBeUndefined()
    await expect(bridge.session.fork('session-live-1')).resolves.toMatchObject({
      sessionId: 'session-live-1',
      status: 'active',
    })
    await expect(bridge.session.forkViaDaemon('session-live-1')).resolves.toMatchObject({
      sessionId: 'session-live-1',
      status: 'active',
    })
    await expect(
      bridge.session.renameViaDaemon('session-live-1', 'Renamed live session'),
    ).resolves.toBeUndefined()
    await expect(bridge.session.interrupt('session-live-1')).resolves.toBeUndefined()
    await expect(bridge.app?.installUpdate()).resolves.toBeUndefined()
    await expect(bridge.app?.openNewWindow()).resolves.toBeUndefined()
    await expect(bridge.dialog.selectDirectory()).resolves.toBe('/tmp/live-session')
    expect(invoke).toHaveBeenCalledWith(IPC_CHANNELS.foundationBootstrap)
    expect(invoke).toHaveBeenCalledWith(IPC_CHANNELS.databaseListProjects)
    expect(invoke).toHaveBeenCalledWith(IPC_CHANNELS.databaseListSessions)
    expect(invoke).toHaveBeenCalledWith(IPC_CHANNELS.databaseListSyncMetadata)
    expect(invoke).toHaveBeenCalledWith(IPC_CHANNELS.pluginListCapabilities)
    expect(invoke).toHaveBeenCalledWith(IPC_CHANNELS.pluginListHosts)
    expect(invoke).toHaveBeenCalledWith(
      IPC_CHANNELS.pluginInvokeCapability,
      'plugin.example:summarize',
      {
        sessionId: 'session-1',
      },
    )
    expect(invoke).toHaveBeenCalledWith(IPC_CHANNELS.appGetUpdateState)
    expect(invoke).toHaveBeenCalledWith(IPC_CHANNELS.appCheckForUpdates)
    expect(invoke).toHaveBeenCalledWith(IPC_CHANNELS.sessionCreate, '/tmp/live')
    expect(invoke).toHaveBeenCalledWith(IPC_CHANNELS.sessionGetSnapshot, 'session-live-1')
    expect(invoke).toHaveBeenCalledWith(IPC_CHANNELS.sessionAttach, 'session-live-1')
    expect(invoke).toHaveBeenCalledWith(IPC_CHANNELS.sessionDetach, 'session-live-1')
    expect(invoke).toHaveBeenCalledWith(
      IPC_CHANNELS.sessionAddUserMessage,
      'session-live-1',
      'hello',
    )
    expect(invoke).toHaveBeenCalledWith(IPC_CHANNELS.sessionUpdateSettings, 'session-live-1', {
      modelId: 'gpt-5.4-mini',
      interactionMode: 'spec',
    })
    expect(invoke).toHaveBeenCalledWith(IPC_CHANNELS.sessionFork, 'session-live-1')
    expect(invoke).toHaveBeenCalledWith(IPC_CHANNELS.sessionForkViaDaemon, 'session-live-1')
    expect(invoke).toHaveBeenCalledWith(
      IPC_CHANNELS.sessionRenameViaDaemon,
      'session-live-1',
      'Renamed live session',
    )
    expect(invoke).toHaveBeenCalledWith(IPC_CHANNELS.sessionInterrupt, 'session-live-1')
    expect(invoke).toHaveBeenCalledWith(IPC_CHANNELS.appInstallUpdate)
    expect(invoke).toHaveBeenCalledWith(IPC_CHANNELS.appOpenWindow)
    expect(invoke).toHaveBeenCalledWith(IPC_CHANNELS.dialogSelectDirectory)
  })

  it('subscribes to notification navigation events and returns an unsubscribe handler', () => {
    const invoke = vi.fn()
    const on = vi.fn()
    const off = vi.fn()
    const listener = vi.fn()

    const bridge = createOxoxBridge(invoke, on, off)
    const unsubscribe = bridge.app?.onNotificationNavigation?.(listener)
    const handler = on.mock.calls[0]?.[1]

    expect(on).toHaveBeenCalledWith(IPC_CHANNELS.appNotificationNavigation, expect.any(Function))

    handler?.(undefined, { sessionId: 'session-live-2' })
    expect(listener).toHaveBeenCalledWith({ sessionId: 'session-live-2' })

    unsubscribe?.()
    expect(off).toHaveBeenCalledWith(IPC_CHANNELS.appNotificationNavigation, handler)
  })

  it('subscribes to app update state events and returns an unsubscribe handler', () => {
    const invoke = vi.fn()
    const on = vi.fn()
    const off = vi.fn()
    const listener = vi.fn()

    const bridge = createOxoxBridge(invoke, on, off)
    const unsubscribe = bridge.app?.onUpdateStateChanged?.(listener)
    const handler = on.mock.calls[0]?.[1]

    expect(on).toHaveBeenCalledWith(IPC_CHANNELS.appUpdateStateChanged, expect.any(Function))

    handler?.(undefined, {
      snapshot: {
        phase: 'downloaded',
        currentVersion: '0.0.4',
        availableVersion: '0.0.5',
        downloadedVersion: '0.0.5',
        progressPercent: 100,
        message: 'Restart to install update.',
        canInstall: true,
      },
    })
    expect(listener).toHaveBeenCalledWith({
      snapshot: {
        phase: 'downloaded',
        currentVersion: '0.0.4',
        availableVersion: '0.0.5',
        downloadedVersion: '0.0.5',
        progressPercent: 100,
        message: 'Restart to install update.',
        canInstall: true,
      },
    })

    unsubscribe?.()
    expect(off).toHaveBeenCalledWith(IPC_CHANNELS.appUpdateStateChanged, handler)
  })

  it('subscribes to foundation change events through the typed bridge', () => {
    const invoke = vi.fn()
    const on = vi.fn()
    const off = vi.fn()
    const listener = vi.fn()

    const bridge = createOxoxBridge(invoke, on, off)
    const unsubscribe = bridge.foundation.onChanged?.(listener)
    const handler = on.mock.calls[0]?.[1]

    expect(on).toHaveBeenCalledWith(IPC_CHANNELS.foundationChanged, expect.any(Function))

    handler?.(undefined, { refreshedAt: '2026-04-01T18:00:00.000Z' })
    expect(listener).toHaveBeenCalledWith({ refreshedAt: '2026-04-01T18:00:00.000Z' })

    unsubscribe?.()
    expect(off).toHaveBeenCalledWith(IPC_CHANNELS.foundationChanged, handler)
  })

  it('subscribes to live-session snapshot change events through the typed bridge', () => {
    const invoke = vi.fn()
    const on = vi.fn()
    const off = vi.fn()
    const listener = vi.fn()

    const bridge = createOxoxBridge(invoke, on, off)
    const unsubscribe = bridge.session.onSnapshotChanged?.(listener)
    const handler = on.mock.calls[0]?.[1]

    expect(on).toHaveBeenCalledWith(IPC_CHANNELS.sessionSnapshotChanged, expect.any(Function))

    handler?.(undefined, {
      snapshot: {
        sessionId: 'session-live-1',
        title: 'Live session',
        status: 'active',
        transport: 'stream-jsonrpc',
        processId: 42,
        viewerCount: 1,
        projectWorkspacePath: '/tmp/workspace',
        parentSessionId: null,
        availableModels: [{ id: 'gpt-5.4', name: 'GPT 5.4' }],
        settings: {
          modelId: 'gpt-5.4',
          interactionMode: 'auto',
        },
        messages: [],
        events: [],
      },
    })
    expect(listener).toHaveBeenCalledWith(
      expect.objectContaining({
        snapshot: expect.objectContaining({ sessionId: 'session-live-1' }),
      }),
    )

    unsubscribe?.()
    expect(off).toHaveBeenCalledWith(IPC_CHANNELS.sessionSnapshotChanged, handler)
  })

  it('subscribes to plugin host change events through the typed bridge', () => {
    const invoke = vi.fn()
    const on = vi.fn()
    const off = vi.fn()
    const listener = vi.fn()

    const bridge = createOxoxBridge(invoke, on, off)
    const unsubscribe = bridge.plugin?.onHostChanged?.(listener)
    const handler = on.mock.calls[0]?.[1]

    expect(on).toHaveBeenCalledWith(IPC_CHANNELS.pluginHostChanged, expect.any(Function))

    handler?.(undefined, {
      snapshot: {
        pluginId: 'plugin.example',
        processId: 4242,
        status: 'running',
        lastError: null,
      },
    })
    expect(listener).toHaveBeenCalledWith({
      snapshot: {
        pluginId: 'plugin.example',
        processId: 4242,
        status: 'running',
        lastError: null,
      },
    })

    unsubscribe?.()
    expect(off).toHaveBeenCalledWith(IPC_CHANNELS.pluginHostChanged, handler)
  })

  it('subscribes to plugin capability change events through the typed bridge', () => {
    const invoke = vi.fn()
    const on = vi.fn()
    const off = vi.fn()
    const listener = vi.fn()

    const bridge = createOxoxBridge(invoke, on, off)
    const unsubscribe = bridge.plugin?.onCapabilitiesChanged?.(listener)
    const handler = on.mock.calls[0]?.[1]

    expect(on).toHaveBeenCalledWith(IPC_CHANNELS.pluginCapabilitiesChanged, expect.any(Function))

    handler?.(undefined, {
      refreshedAt: '2026-04-01T18:00:00.000Z',
    })
    expect(listener).toHaveBeenCalledWith({
      refreshedAt: '2026-04-01T18:00:00.000Z',
    })

    unsubscribe?.()
    expect(off).toHaveBeenCalledWith(IPC_CHANNELS.pluginCapabilitiesChanged, handler)
  })
})
