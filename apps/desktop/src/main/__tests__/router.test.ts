import { homedir } from 'node:os'
import { join } from 'node:path'

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
    const factoryApi = {
      listMachineTemplates: vi.fn().mockResolvedValue({ templates: [] }),
      getMachineTemplate: vi.fn().mockResolvedValue({ templateId: 'template-1' }),
      listComputers: vi.fn().mockResolvedValue({ computers: [] }),
      getComputer: vi.fn().mockResolvedValue({ id: 'computer-1' }),
      createComputer: vi.fn().mockResolvedValue({ id: 'computer-1' }),
      getComputerByName: vi.fn().mockResolvedValue({ id: 'computer-1' }),
      updateComputer: vi.fn().mockResolvedValue({ id: 'computer-1' }),
      deleteComputer: vi.fn().mockResolvedValue(undefined),
      restartComputer: vi.fn().mockResolvedValue(undefined),
      refreshComputer: vi.fn().mockResolvedValue({ configured: 1 }),
      getComputerMetrics: vi.fn().mockResolvedValue([]),
      retryInstallDeps: vi.fn().mockResolvedValue({ id: 'computer-1' }),
      listRemoteSessions: vi.fn().mockResolvedValue({ sessions: [] }),
    }
    const service = {
      factoryApi,
      getBootstrap: vi.fn().mockReturnValue({ ok: true }),
      listProjects: vi.fn().mockReturnValue([{ id: 'project-1' }]),
      listSessions: vi.fn().mockReturnValue([]),
      listSyncMetadata: vi.fn().mockReturnValue([]),
      listWorkspaceFiles: vi.fn().mockResolvedValue({ files: ['src/App.tsx'] }),
      searchWorkspaceFiles: vi.fn().mockResolvedValue({ files: ['src/App.tsx'], totalFiles: 4 }),
      getWorkspaceFileContent: vi.fn().mockResolvedValue({
        content: 'export function App() {}\n',
        byteLength: 25,
        encoding: 'utf8',
        mimeType: 'text/typescript',
        isBinary: false,
      }),
      getGitDiff: vi.fn().mockResolvedValue({
        success: true,
        data: {
          diff: 'diff --git a/src/App.tsx b/src/App.tsx\n',
          branch: 'feature/oxo-22',
          baseBranch: 'main',
          files: [],
          totalAdditions: 0,
          totalDeletions: 0,
          remoteUrl: null,
          commits: [],
          committedDiff: '',
          committedFiles: [],
          committedTotalAdditions: 0,
          committedTotalDeletions: 0,
          unstagedDiff: '',
          unstagedFiles: [],
          unstagedTotalAdditions: 0,
          unstagedTotalDeletions: 0,
        },
      }),
      commitGitChanges: vi.fn().mockResolvedValue({ success: true }),
      pushGitBranch: vi.fn().mockResolvedValue({ success: true }),
      createGitPullRequest: vi.fn().mockResolvedValue({
        number: 22,
        title: 'Add OXO-22 support',
        url: 'https://github.com/theadriann/oxox/pull/22',
        state: 'open',
        draft: false,
      }),
      searchSessions: vi.fn().mockReturnValue({
        query: 'sdk',
        matches: [{ sessionId: 'session-1', score: 10, reasons: [] }],
      }),
      getSearchIndexingProgress: vi.fn().mockReturnValue({
        indexedSessions: 4,
        totalSessions: 10,
        isIndexing: true,
        updatedAt: '2026-04-27T00:00:00.000Z',
      }),
      getSessionTranscript: vi.fn(),
      getSessionTranscriptScrollState: vi.fn().mockReturnValue({
        sessionId: 'session-scroll',
        scrollTop: 120,
        scrollHeight: 900,
        clientHeight: 300,
        distanceFromBottom: 480,
        isAtBottom: false,
        updatedAt: '2026-06-17T00:00:00.000Z',
      }),
      setSessionTranscriptScrollState: vi.fn(),
      createSession: vi.fn(),
      getSessionSnapshot: vi.fn(),
      attachSession: vi.fn(),
      detachSession: vi.fn(),
      addUserMessage: vi.fn(),
      renameSession: vi.fn().mockResolvedValue(undefined),
      moveSessionProject: vi.fn().mockResolvedValue(undefined),
      deleteSession: vi.fn().mockResolvedValue(undefined),
      updateSessionSettings: vi.fn(),
      listSessionTools: vi
        .fn()
        .mockResolvedValue([{ id: 'tool-read', llmId: 'Read', currentlyAllowed: true }]),
      listSessionSkills: vi
        .fn()
        .mockResolvedValue([{ name: 'vault-knowledge', location: 'personal' }]),
      listSessionMcpServers: vi.fn().mockResolvedValue([{ name: 'figma', status: 'connected' }]),
      getSessionContextStats: vi.fn().mockResolvedValue({
        used: 12_345,
        remaining: 87_655,
        limit: 100_000,
        accuracy: 'exact',
        updatedAt: '2026-04-23T21:13:04.000Z',
      }),
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
        channel !== 'sessionEventBatch' &&
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
    expect(
      await ipcMain.handlers.get(IPC_CHANNELS.factoryApiListMachineTemplates)?.(undefined, {
        limit: 10,
      }),
    ).toEqual({ templates: [] })
    expect(factoryApi.listMachineTemplates).toHaveBeenCalledWith({ limit: 10 })
    expect(
      await ipcMain.handlers.get(IPC_CHANNELS.factoryApiGetMachineTemplate)?.(undefined, {
        templateId: 'template-1',
      }),
    ).toEqual({ templateId: 'template-1' })
    expect(factoryApi.getMachineTemplate).toHaveBeenCalledWith({ templateId: 'template-1' })
    expect(
      await ipcMain.handlers.get(IPC_CHANNELS.factoryApiListComputers)?.(undefined, { limit: 5 }),
    ).toEqual({ computers: [] })
    expect(factoryApi.listComputers).toHaveBeenCalledWith({ limit: 5 })
    expect(
      await ipcMain.handlers.get(IPC_CHANNELS.factoryApiGetComputer)?.(undefined, {
        computerId: 'computer-1',
      }),
    ).toEqual({ id: 'computer-1' })
    expect(factoryApi.getComputer).toHaveBeenCalledWith({ computerId: 'computer-1' })
    expect(
      await ipcMain.handlers.get(IPC_CHANNELS.factoryApiCreateComputer)?.(undefined, {
        name: 'devbox',
        remoteUser: 'factory',
        repos: ['https://github.com/factory/test'],
      }),
    ).toEqual({ id: 'computer-1' })
    expect(factoryApi.createComputer).toHaveBeenCalledWith({
      name: 'devbox',
      remoteUser: 'factory',
      repos: ['https://github.com/factory/test'],
    })
    expect(
      await ipcMain.handlers.get(IPC_CHANNELS.factoryApiGetComputerByName)?.(undefined, {
        name: 'devbox',
      }),
    ).toEqual({ id: 'computer-1' })
    expect(factoryApi.getComputerByName).toHaveBeenCalledWith({ name: 'devbox' })
    expect(
      await ipcMain.handlers.get(IPC_CHANNELS.factoryApiUpdateComputer)?.(undefined, {
        computerId: 'computer-1',
        name: 'renamed',
      }),
    ).toEqual({ id: 'computer-1' })
    expect(factoryApi.updateComputer).toHaveBeenCalledWith({
      computerId: 'computer-1',
      name: 'renamed',
    })
    await ipcMain.handlers.get(IPC_CHANNELS.factoryApiDeleteComputer)?.(undefined, {
      computerId: 'computer-1',
    })
    await ipcMain.handlers.get(IPC_CHANNELS.factoryApiRestartComputer)?.(undefined, {
      computerId: 'computer-1',
    })
    expect(
      await ipcMain.handlers.get(IPC_CHANNELS.factoryApiRefreshComputer)?.(undefined, {
        computerId: 'computer-1',
      }),
    ).toEqual({ configured: 1 })
    expect(
      await ipcMain.handlers.get(IPC_CHANNELS.factoryApiGetComputerMetrics)?.(undefined, {
        computerId: 'computer-1',
        start: '2026-06-04T00:00:00Z',
      }),
    ).toEqual([])
    expect(
      await ipcMain.handlers.get(IPC_CHANNELS.factoryApiRetryInstallDeps)?.(undefined, {
        computerId: 'computer-1',
      }),
    ).toEqual({ id: 'computer-1' })
    expect(
      await ipcMain.handlers.get(IPC_CHANNELS.factoryApiListRemoteSessions)?.(undefined, {
        computerId: 'computer-1',
      }),
    ).toEqual({ sessions: [] })
    expect(factoryApi.deleteComputer).toHaveBeenCalledWith({ computerId: 'computer-1' })
    expect(factoryApi.restartComputer).toHaveBeenCalledWith({ computerId: 'computer-1' })
    expect(factoryApi.refreshComputer).toHaveBeenCalledWith({ computerId: 'computer-1' })
    expect(factoryApi.getComputerMetrics).toHaveBeenCalledWith({
      computerId: 'computer-1',
      start: '2026-06-04T00:00:00Z',
    })
    expect(factoryApi.retryInstallDeps).toHaveBeenCalledWith({ computerId: 'computer-1' })
    expect(factoryApi.listRemoteSessions).toHaveBeenCalledWith({ computerId: 'computer-1' })
    expect(
      await ipcMain.handlers.get(IPC_CHANNELS.sessionSearch)?.(undefined, { query: 'sdk' }),
    ).toEqual({
      query: 'sdk',
      matches: [{ sessionId: 'session-1', score: 10, reasons: [] }],
    })
    expect(service.searchSessions).toHaveBeenCalledWith({ query: 'sdk' })
    expect(
      await ipcMain.handlers.get(IPC_CHANNELS.transcriptGetScrollState)?.(
        undefined,
        'session-scroll',
      ),
    ).toEqual(expect.objectContaining({ sessionId: 'session-scroll', scrollTop: 120 }))
    await ipcMain.handlers.get(IPC_CHANNELS.transcriptSetScrollState)?.(undefined, {
      sessionId: 'session-scroll',
      scrollTop: 240,
      scrollHeight: 900,
      clientHeight: 300,
      distanceFromBottom: 360,
      isAtBottom: false,
      updatedAt: '2026-06-17T00:00:01.000Z',
    })
    expect(service.getSessionTranscriptScrollState).toHaveBeenCalledWith('session-scroll')
    expect(service.setSessionTranscriptScrollState).toHaveBeenCalledWith(
      expect.objectContaining({ sessionId: 'session-scroll', scrollTop: 240 }),
    )
    await expect(
      ipcMain.handlers.get(IPC_CHANNELS.workspaceFilesList)?.(undefined, {
        sessionId: 'session-daemon',
        showHidden: true,
      }),
    ).resolves.toEqual({ files: ['src/App.tsx'] })
    await expect(
      ipcMain.handlers.get(IPC_CHANNELS.workspaceFilesSearch)?.(undefined, {
        sessionId: 'session-daemon',
        query: 'app',
        maxResults: 8,
      }),
    ).resolves.toEqual({ files: ['src/App.tsx'], totalFiles: 4 })
    await expect(
      ipcMain.handlers.get(IPC_CHANNELS.workspaceFilesGetContent)?.(undefined, {
        sessionId: 'session-daemon',
        filePath: 'src/App.tsx',
        encoding: 'utf8',
      }),
    ).resolves.toEqual({
      content: 'export function App() {}\n',
      byteLength: 25,
      encoding: 'utf8',
      mimeType: 'text/typescript',
      isBinary: false,
    })
    expect(service.listWorkspaceFiles).toHaveBeenCalledWith({
      sessionId: 'session-daemon',
      showHidden: true,
    })
    expect(service.searchWorkspaceFiles).toHaveBeenCalledWith({
      sessionId: 'session-daemon',
      query: 'app',
      maxResults: 8,
    })
    expect(service.getWorkspaceFileContent).toHaveBeenCalledWith({
      sessionId: 'session-daemon',
      filePath: 'src/App.tsx',
      encoding: 'utf8',
    })
    await expect(
      ipcMain.handlers.get(IPC_CHANNELS.gitGetDiff)?.(undefined, {
        sessionId: 'session-daemon',
        baseBranch: 'main',
      }),
    ).resolves.toEqual({
      success: true,
      data: expect.objectContaining({ branch: 'feature/oxo-22' }),
    })
    await expect(
      ipcMain.handlers.get(IPC_CHANNELS.gitCommit)?.(undefined, {
        sessionId: 'session-daemon',
        message: 'Add OXO-22 support',
      }),
    ).resolves.toEqual({ success: true })
    await expect(
      ipcMain.handlers.get(IPC_CHANNELS.gitPush)?.(undefined, {
        sessionId: 'session-daemon',
      }),
    ).resolves.toEqual({ success: true })
    await expect(
      ipcMain.handlers.get(IPC_CHANNELS.gitCreatePullRequest)?.(undefined, {
        sessionId: 'session-daemon',
        title: 'Add OXO-22 support',
        baseBranch: 'main',
      }),
    ).resolves.toEqual({
      number: 22,
      title: 'Add OXO-22 support',
      url: 'https://github.com/theadriann/oxox/pull/22',
      state: 'open',
      draft: false,
    })
    expect(service.getGitDiff).toHaveBeenCalledWith({
      sessionId: 'session-daemon',
      baseBranch: 'main',
    })
    expect(service.commitGitChanges).toHaveBeenCalledWith({
      sessionId: 'session-daemon',
      message: 'Add OXO-22 support',
    })
    expect(service.pushGitBranch).toHaveBeenCalledWith({
      sessionId: 'session-daemon',
    })
    expect(service.createGitPullRequest).toHaveBeenCalledWith({
      sessionId: 'session-daemon',
      title: 'Add OXO-22 support',
      baseBranch: 'main',
    })
    expect(await ipcMain.handlers.get(IPC_CHANNELS.sessionSearchIndexingProgress)?.()).toEqual({
      indexedSessions: 4,
      totalSessions: 10,
      isIndexing: true,
      updatedAt: '2026-04-27T00:00:00.000Z',
    })
    await ipcMain.handlers.get(IPC_CHANNELS.sessionRename)?.(undefined, 'session-1', 'Renamed live')
    expect(service.renameSession).toHaveBeenCalledWith('session-1', 'Renamed live')
    await ipcMain.handlers.get(IPC_CHANNELS.sessionMoveProject)?.(
      undefined,
      'session-1',
      '/tmp/target-project',
    )
    expect(service.moveSessionProject).toHaveBeenCalledWith('session-1', '/tmp/target-project')
    await ipcMain.handlers.get(IPC_CHANNELS.sessionDelete)?.(undefined, 'session-1')
    expect(service.deleteSession).toHaveBeenCalledWith('session-1')
    expect(
      await ipcMain.handlers.get(IPC_CHANNELS.sessionListTools)?.(undefined, 'session-1'),
    ).toEqual([{ id: 'tool-read', llmId: 'Read', currentlyAllowed: true }])
    expect(
      await ipcMain.handlers.get(IPC_CHANNELS.sessionListSkills)?.(undefined, 'session-1'),
    ).toEqual([{ name: 'vault-knowledge', location: 'personal' }])
    expect(
      await ipcMain.handlers.get(IPC_CHANNELS.sessionListMcpServers)?.(undefined, 'session-1'),
    ).toEqual([{ name: 'figma', status: 'connected' }])
    expect(
      await ipcMain.handlers.get(IPC_CHANNELS.sessionGetContextStats)?.(undefined, 'session-1'),
    ).toEqual({
      used: 12_345,
      remaining: 87_655,
      limit: 100_000,
      accuracy: 'exact',
      updatedAt: '2026-04-23T21:13:04.000Z',
    })
    expect(service.listSessionTools).toHaveBeenCalledWith('session-1')
    expect(service.listSessionSkills).toHaveBeenCalledWith('session-1')
    expect(service.listSessionMcpServers).toHaveBeenCalledWith('session-1')
    expect(service.getSessionContextStats).toHaveBeenCalledWith('session-1')
    expect(
      await ipcMain.handlers.get(IPC_CHANNELS.sessionForkViaDaemon)?.(
        { sender: { id: 42, once: vi.fn() } },
        'session-1',
        '[Fork] Session',
      ),
    ).toEqual({ sessionId: 'session-daemon-fork' })
    expect(service.forkSessionViaDaemon).toHaveBeenCalledWith(
      'session-1',
      'renderer:42',
      '[Fork] Session',
    )
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
      listWorkspaceFiles: vi.fn(),
      searchWorkspaceFiles: vi.fn(),
      getWorkspaceFileContent: vi.fn(),
      getSessionTranscript: vi.fn(),
      getSessionTranscriptScrollState: vi.fn(),
      setSessionTranscriptScrollState: vi.fn(),
      createSession: vi.fn().mockResolvedValue(snapshot),
      getSessionSnapshot: vi.fn(),
      attachSession: vi.fn().mockResolvedValue(snapshot),
      detachSession: vi.fn().mockResolvedValue(snapshot),
      addUserMessage: vi.fn(),
      renameSession: vi.fn(),
      moveSessionProject: vi.fn(),
      deleteSession: vi.fn(),
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

    const addUserMessageHandler = ipcMain.handlers.get(IPC_CHANNELS.sessionAddUserMessage)
    const messagePayload = {
      text: 'Describe this image',
      images: [{ type: 'base64' as const, data: 'ZmFrZQ==', mediaType: 'image/png' as const }],
    }

    await addUserMessageHandler?.({ sender }, 'session-1', messagePayload)

    expect(service.addUserMessage).toHaveBeenCalledWith('session-1', messagePayload)
  })

  it('requests macOS protected directory access before creating a Downloads session', async () => {
    const ipcMain = createMockIpcMain()
    const sender = { id: 42, once: vi.fn() }
    const ownerWindow = { id: 'window-42' }
    const downloadsPath = join(homedir(), 'Downloads')
    const stopAccessing = vi.fn()
    const service = {
      createSession: vi.fn().mockResolvedValue({ sessionId: 'session-downloads' }),
    }
    const showOpenDialog = vi.fn().mockResolvedValue({
      bookmarks: ['downloads-bookmark'],
      canceled: false,
      filePaths: [downloadsPath],
    })
    const startAccessingSecurityScopedResource = vi.fn(() => stopAccessing)

    const cleanup = registerAppIpcHandlers({
      ipcMain,
      service: service as never,
      updater: { getState: vi.fn(), checkForUpdates: vi.fn(), installUpdate: vi.fn() },
      pluginRegistry: { listCapabilities: vi.fn().mockReturnValue([]) },
      pluginHost: { listHosts: vi.fn().mockReturnValue([]) },
      invokePluginCapability: vi.fn(),
      getRuntimeInfo: vi.fn(),
      createAppWindow: vi.fn(),
      showOpenDialog,
      startAccessingSecurityScopedResource,
      platform: 'darwin',
      resolveOwnerWindow: vi.fn().mockReturnValue(ownerWindow),
    })

    await ipcMain.handlers.get(IPC_CHANNELS.sessionCreate)?.({ sender }, { cwd: downloadsPath })

    expect(showOpenDialog).toHaveBeenCalledWith(
      ownerWindow,
      expect.objectContaining({
        buttonLabel: 'Allow access',
        defaultPath: downloadsPath,
        securityScopedBookmarks: true,
      }),
    )
    expect(startAccessingSecurityScopedResource).toHaveBeenCalledWith('downloads-bookmark')
    expect(service.createSession).toHaveBeenCalledWith({ cwd: downloadsPath }, 'renderer:42')
    expect(stopAccessing).toHaveBeenCalledTimes(1)

    cleanup()
  })

  it('requests macOS protected directory access before attaching a Downloads session', async () => {
    const ipcMain = createMockIpcMain()
    const sender = { id: 42, once: vi.fn() }
    const ownerWindow = { id: 'window-42' }
    const downloadsPath = join(homedir(), 'Downloads')
    const service = {
      attachSession: vi.fn().mockResolvedValue({ sessionId: 'session-downloads' }),
      getSessionSnapshot: vi.fn().mockReturnValue(null),
      listSessions: vi.fn().mockReturnValue([
        {
          id: 'session-downloads',
          projectWorkspacePath: downloadsPath,
        },
      ]),
    }
    const showOpenDialog = vi.fn().mockResolvedValue({
      bookmarks: ['downloads-bookmark'],
      canceled: false,
      filePaths: [downloadsPath],
    })

    const cleanup = registerAppIpcHandlers({
      ipcMain,
      service: service as never,
      updater: { getState: vi.fn(), checkForUpdates: vi.fn(), installUpdate: vi.fn() },
      pluginRegistry: { listCapabilities: vi.fn().mockReturnValue([]) },
      pluginHost: { listHosts: vi.fn().mockReturnValue([]) },
      invokePluginCapability: vi.fn(),
      getRuntimeInfo: vi.fn(),
      createAppWindow: vi.fn(),
      showOpenDialog,
      platform: 'darwin',
      resolveOwnerWindow: vi.fn().mockReturnValue(ownerWindow),
    })

    await ipcMain.handlers.get(IPC_CHANNELS.sessionAttach)?.({ sender }, 'session-downloads')

    expect(showOpenDialog).toHaveBeenCalledWith(
      ownerWindow,
      expect.objectContaining({
        defaultPath: downloadsPath,
        securityScopedBookmarks: true,
      }),
    )
    expect(service.attachSession).toHaveBeenCalledWith('session-downloads', 'renderer:42')

    cleanup()
  })

  it('keeps foundation bootstrap readable during shutdown cleanup when requested', async () => {
    const ipcMain = createMockIpcMain()
    const service = {
      getBootstrap: vi.fn().mockReturnValue({ ok: true, phase: 'shutdown-safe' }),
      listProjects: vi.fn().mockReturnValue([]),
      listSessions: vi.fn().mockReturnValue([]),
      listSyncMetadata: vi.fn().mockReturnValue([]),
      listWorkspaceFiles: vi.fn(),
      searchWorkspaceFiles: vi.fn(),
      getWorkspaceFileContent: vi.fn(),
      getSessionTranscript: vi.fn(),
      getSessionTranscriptScrollState: vi.fn(),
      setSessionTranscriptScrollState: vi.fn(),
      createSession: vi.fn(),
      getSessionSnapshot: vi.fn(),
      attachSession: vi.fn(),
      detachSession: vi.fn(),
      addUserMessage: vi.fn(),
      renameSession: vi.fn(),
      moveSessionProject: vi.fn(),
      deleteSession: vi.fn(),
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
