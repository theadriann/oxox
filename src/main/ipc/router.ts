import { homedir } from 'node:os'
import { relative, resolve } from 'node:path'

import type {
  AppUpdateState,
  CreatePullRequestRequest,
  GitCommitRequest,
  GitDiffRequest,
  GitPushRequest,
  LiveSessionAddUserMessageRequest,
  LiveSessionCreateRequest,
  RuntimeInfo,
  TranscriptPerformanceEvent,
  WorkspaceFileContentRequest,
  WorkspaceFilesListRequest,
  WorkspaceFilesSearchRequest,
} from '../../shared/ipc/contracts'
import { IPC_CHANNELS } from '../../shared/ipc/contracts'
import type { PluginRegistry } from '../app/PluginRegistry'
import type { FoundationService } from '../integration/foundationService'
import type { LocalPluginHostManager } from '../integration/plugins/localPluginHost'
import {
  clearRendererSessionAttachments,
  listRendererSessionAttachments,
  registerRendererSessionAttachment,
  removeRendererSessionAttachment,
} from './liveSessionAttachmentRegistry'

interface IpcMainLike {
  handle: (channel: string, handler: (...args: unknown[]) => unknown) => void
  removeHandler: (channel: string) => void
}

interface DialogResultLike {
  canceled: boolean
  filePaths: string[]
  bookmarks?: string[]
}

interface WebContentsLike {
  id: number
  once: (event: 'destroyed', listener: () => void) => void
}

interface IpcInvokeEventLike {
  sender: WebContentsLike
}

export interface RegisterAppIpcHandlersOptions {
  ipcMain: IpcMainLike
  service: FoundationService
  updater: {
    getState: () => AppUpdateState
    checkForUpdates: () => Promise<AppUpdateState>
    installUpdate: () => void
  }
  keepBootstrapHandlerOnCleanup?: boolean
  pluginRegistry: Pick<PluginRegistry, 'listCapabilities'>
  pluginHost: Pick<LocalPluginHostManager, 'listHosts'>
  invokePluginCapability: (capabilityId: string, payload?: unknown) => Promise<unknown>
  getRuntimeInfo: () => RuntimeInfo
  createAppWindow: () => Promise<void>
  showOpenDialog: (
    ownerWindow: unknown,
    options: {
      title: string
      buttonLabel: string
      defaultPath?: string
      message?: string
      properties: Array<'openDirectory' | 'createDirectory'>
      securityScopedBookmarks?: boolean
    },
  ) => Promise<DialogResultLike>
  startAccessingSecurityScopedResource?: (bookmarkData: string) => () => void
  platform?: NodeJS.Platform
  resolveOwnerWindow: (sender: WebContentsLike) => unknown
  logTranscriptPerformance?: (events: TranscriptPerformanceEvent[]) => void
}

export function registerAppIpcHandlers({
  ipcMain,
  service,
  updater,
  keepBootstrapHandlerOnCleanup = false,
  pluginRegistry,
  pluginHost,
  invokePluginCapability,
  getRuntimeInfo,
  createAppWindow,
  showOpenDialog,
  startAccessingSecurityScopedResource,
  platform = process.platform,
  resolveOwnerWindow,
  logTranscriptPerformance = () => undefined,
}: RegisterAppIpcHandlersOptions): () => void {
  const registeredChannels: string[] = []
  const rendererCleanupRegistered = new Set<number>()
  let lastBootstrapSnapshot: ReturnType<FoundationService['getBootstrap']> | null = null
  const authorizedDirectoryBookmarks = new Map<string, string | null>()

  const registerHandler = (channel: string, handler: (...args: unknown[]) => unknown): void => {
    ipcMain.handle(channel, handler)
    registeredChannels.push(channel)
  }

  const ensureSenderCleanup = (sender: WebContentsLike): void => {
    if (rendererCleanupRegistered.has(sender.id)) {
      return
    }

    rendererCleanupRegistered.add(sender.id)
    sender.once('destroyed', () => {
      const attachments = listRendererSessionAttachments(sender.id)

      for (const sessionId of attachments) {
        void service.detachSession(sessionId, `renderer:${sender.id}`)
      }

      clearRendererSessionAttachments(sender.id)
      rendererCleanupRegistered.delete(sender.id)
    })
  }

  const rememberDirectoryAccess = (directoryPath: string, bookmark?: string | null): void => {
    authorizedDirectoryBookmarks.set(resolveWorkspacePath(directoryPath), bookmark ?? null)
  }

  const findDirectoryAccessBookmark = (directoryPath: string): string | null | undefined => {
    const normalizedPath = resolveWorkspacePath(directoryPath)

    for (const [authorizedPath, bookmark] of authorizedDirectoryBookmarks) {
      if (isSameOrDescendantPath(normalizedPath, authorizedPath)) {
        return bookmark
      }
    }

    return undefined
  }

  const requestDirectoryAccess = async (
    ownerWindow: unknown,
    directoryPath: string,
  ): Promise<void> => {
    const normalizedPath = resolveWorkspacePath(directoryPath)
    const result = await showOpenDialog(ownerWindow, {
      title: 'Allow workspace access',
      buttonLabel: 'Allow access',
      defaultPath: normalizedPath,
      message: `OXOX needs permission to access ${normalizedPath} before starting Droid there.`,
      properties: ['openDirectory'],
      securityScopedBookmarks: true,
    })

    if (result.canceled) {
      throw new Error(`OXOX needs permission to access ${normalizedPath}.`)
    }

    const selectedPath = result.filePaths[0]
    if (
      !selectedPath ||
      !isSameOrDescendantPath(normalizedPath, resolveWorkspacePath(selectedPath))
    ) {
      throw new Error(`Please select ${normalizedPath} to allow OXOX to access this workspace.`)
    }

    rememberDirectoryAccess(selectedPath, result.bookmarks?.[0] ?? null)
  }

  const withWorkspaceAccess = async <T>(
    ownerWindow: unknown,
    workspacePath: string | null | undefined,
    action: () => Promise<T>,
  ): Promise<T> => {
    if (!workspacePath || !shouldRequestMacosDirectoryAccess(platform, workspacePath)) {
      return action()
    }

    const normalizedPath = resolveWorkspacePath(workspacePath)

    if (findDirectoryAccessBookmark(normalizedPath) === undefined) {
      await requestDirectoryAccess(ownerWindow, normalizedPath)
    }

    const bookmark = findDirectoryAccessBookmark(normalizedPath)
    const stopAccessing =
      bookmark && startAccessingSecurityScopedResource
        ? startAccessingSecurityScopedResource(bookmark)
        : null

    try {
      return await action()
    } finally {
      stopAccessing?.()
    }
  }

  const getSessionWorkspacePath = (sessionId: string): string | null =>
    service.getSessionSnapshot(sessionId)?.projectWorkspacePath ??
    service.listSessions().find((session) => session.id === sessionId)?.projectWorkspacePath ??
    null

  const handlers: Record<string, (...args: unknown[]) => unknown> = {
    [IPC_CHANNELS.runtimeInfo]: () => getRuntimeInfo(),
    [IPC_CHANNELS.appGetUpdateState]: () => updater.getState(),
    [IPC_CHANNELS.appCheckForUpdates]: () => updater.checkForUpdates(),
    [IPC_CHANNELS.appInstallUpdate]: () => updater.installUpdate(),
    [IPC_CHANNELS.appOpenWindow]: async () => {
      await createAppWindow()
    },
    [IPC_CHANNELS.diagnosticsLogTranscriptPerformance]: (
      _event,
      events: TranscriptPerformanceEvent[],
    ) => {
      logTranscriptPerformance(events)
    },
    [IPC_CHANNELS.pluginListCapabilities]: () =>
      pluginRegistry.listCapabilities().map((capability) => ({
        qualifiedId: capability.qualifiedId,
        pluginId: capability.pluginId,
        kind: capability.capability.kind,
        name: capability.capability.name,
        displayName: capability.capability.displayName,
      })),
    [IPC_CHANNELS.pluginListHosts]: () => pluginHost.listHosts(),
    [IPC_CHANNELS.pluginInvokeCapability]: (_event, capabilityId: string, payload?: unknown) =>
      invokePluginCapability(capabilityId, payload),
    [IPC_CHANNELS.dialogSelectDirectory]: async (event: IpcInvokeEventLike) => {
      const ownerWindow = resolveOwnerWindow(event.sender)
      const result = await showOpenDialog(ownerWindow, {
        title: 'Select a workspace',
        buttonLabel: 'Use folder',
        properties: ['openDirectory', 'createDirectory'],
        securityScopedBookmarks: true,
      })

      if (result.canceled) {
        return null
      }

      const selectedPath = result.filePaths[0] ?? null
      if (selectedPath) {
        rememberDirectoryAccess(selectedPath, result.bookmarks?.[0] ?? null)
      }

      return selectedPath
    },
    [IPC_CHANNELS.foundationBootstrap]: () => {
      const snapshot = service.getBootstrap()
      lastBootstrapSnapshot = snapshot
      return snapshot
    },
    [IPC_CHANNELS.foundationReindexSessions]: () => service.reindexSessions(),
    [IPC_CHANNELS.foundationMergeSessionFolderMetadata]: (
      _event,
      metadata: Parameters<FoundationService['mergeSessionFolderMetadata']>[0],
    ) => service.mergeSessionFolderMetadata(metadata),
    [IPC_CHANNELS.foundationUpsertSessionFolder]: (
      _event,
      folder: Parameters<FoundationService['upsertSessionFolder']>[0],
    ) => service.upsertSessionFolder(folder),
    [IPC_CHANNELS.foundationDeleteSessionFolder]: (_event, folderId: string) =>
      service.deleteSessionFolder(folderId),
    [IPC_CHANNELS.foundationSetSessionFolderAssignment]: (
      _event,
      assignment: Parameters<FoundationService['setSessionFolderAssignment']>[0],
    ) => service.setSessionFolderAssignment(assignment),
    [IPC_CHANNELS.foundationRemoveSessionFolderAssignment]: (_event, sessionId: string) =>
      service.removeSessionFolderAssignment(sessionId),
    [IPC_CHANNELS.databaseListProjects]: () => service.listProjects(),
    [IPC_CHANNELS.databaseListSessions]: () => service.listSessions(),
    [IPC_CHANNELS.databaseListSyncMetadata]: () => service.listSyncMetadata(),
    [IPC_CHANNELS.workspaceFilesList]: (_event, request: WorkspaceFilesListRequest) =>
      service.listWorkspaceFiles(request),
    [IPC_CHANNELS.workspaceFilesSearch]: (_event, request: WorkspaceFilesSearchRequest) =>
      service.searchWorkspaceFiles(request),
    [IPC_CHANNELS.workspaceFilesGetContent]: (_event, request: WorkspaceFileContentRequest) =>
      service.getWorkspaceFileContent(request),
    [IPC_CHANNELS.gitGetDiff]: (_event, request: GitDiffRequest) => service.getGitDiff(request),
    [IPC_CHANNELS.gitCommit]: (_event, request: GitCommitRequest) =>
      service.commitGitChanges(request),
    [IPC_CHANNELS.gitPush]: (_event, request: GitPushRequest) => service.pushGitBranch(request),
    [IPC_CHANNELS.gitCreatePullRequest]: (_event, request: CreatePullRequestRequest) =>
      service.createGitPullRequest(request),
    [IPC_CHANNELS.factoryApiListMachineTemplates]: (
      _event,
      request: Parameters<FoundationService['factoryApi']['listMachineTemplates']>[0] = {},
    ) => service.factoryApi.listMachineTemplates(request),
    [IPC_CHANNELS.factoryApiGetMachineTemplate]: (
      _event,
      request: Parameters<FoundationService['factoryApi']['getMachineTemplate']>[0],
    ) => service.factoryApi.getMachineTemplate(request),
    [IPC_CHANNELS.factoryApiListComputers]: (
      _event,
      request: Parameters<FoundationService['factoryApi']['listComputers']>[0] = {},
    ) => service.factoryApi.listComputers(request),
    [IPC_CHANNELS.factoryApiGetComputer]: (
      _event,
      request: Parameters<FoundationService['factoryApi']['getComputer']>[0],
    ) => service.factoryApi.getComputer(request),
    [IPC_CHANNELS.factoryApiCreateComputer]: (
      _event,
      request: Parameters<FoundationService['factoryApi']['createComputer']>[0],
    ) => service.factoryApi.createComputer(request),
    [IPC_CHANNELS.factoryApiGetComputerByName]: (
      _event,
      request: Parameters<FoundationService['factoryApi']['getComputerByName']>[0],
    ) => service.factoryApi.getComputerByName(request),
    [IPC_CHANNELS.factoryApiUpdateComputer]: (
      _event,
      request: Parameters<FoundationService['factoryApi']['updateComputer']>[0],
    ) => service.factoryApi.updateComputer(request),
    [IPC_CHANNELS.factoryApiDeleteComputer]: (
      _event,
      request: Parameters<FoundationService['factoryApi']['deleteComputer']>[0],
    ) => service.factoryApi.deleteComputer(request),
    [IPC_CHANNELS.factoryApiRestartComputer]: (
      _event,
      request: Parameters<FoundationService['factoryApi']['restartComputer']>[0],
    ) => service.factoryApi.restartComputer(request),
    [IPC_CHANNELS.factoryApiRefreshComputer]: (
      _event,
      request: Parameters<FoundationService['factoryApi']['refreshComputer']>[0],
    ) => service.factoryApi.refreshComputer(request),
    [IPC_CHANNELS.factoryApiGetComputerMetrics]: (
      _event,
      request: Parameters<FoundationService['factoryApi']['getComputerMetrics']>[0],
    ) => service.factoryApi.getComputerMetrics(request),
    [IPC_CHANNELS.factoryApiRetryInstallDeps]: (
      _event,
      request: Parameters<FoundationService['factoryApi']['retryInstallDeps']>[0],
    ) => service.factoryApi.retryInstallDeps(request),
    [IPC_CHANNELS.factoryApiListRemoteSessions]: (
      _event,
      request: Parameters<FoundationService['factoryApi']['listRemoteSessions']>[0] = {},
    ) => service.factoryApi.listRemoteSessions(request),
    [IPC_CHANNELS.sessionSearch]: (
      _event,
      request: Parameters<FoundationService['searchSessions']>[0],
    ) => service.searchSessions(request),
    [IPC_CHANNELS.sessionSearchIndexingProgress]: () => service.getSearchIndexingProgress(),
    [IPC_CHANNELS.transcriptGetSessionTranscript]: (_event, sessionId: string) =>
      service.getSessionTranscript(sessionId),
    [IPC_CHANNELS.transcriptGetScrollState]: (_event, sessionId: string) =>
      service.getSessionTranscriptScrollState(sessionId),
    [IPC_CHANNELS.transcriptSetScrollState]: (
      _event,
      state: Parameters<FoundationService['setSessionTranscriptScrollState']>[0],
    ) => service.setSessionTranscriptScrollState(state),
    [IPC_CHANNELS.sessionCreate]: async (
      event: IpcInvokeEventLike,
      request: LiveSessionCreateRequest,
    ) => {
      ensureSenderCleanup(event.sender)
      const ownerWindow = resolveOwnerWindow(event.sender)
      const snapshot = await withWorkspaceAccess(ownerWindow, request.cwd, () =>
        service.createSession(request, `renderer:${event.sender.id}`),
      )
      registerRendererSessionAttachment(event.sender.id, snapshot.sessionId)
      return snapshot
    },
    [IPC_CHANNELS.sessionGetSnapshot]: (_event, sessionId: string) =>
      service.getSessionSnapshot(sessionId),
    [IPC_CHANNELS.sessionAttach]: async (event: IpcInvokeEventLike, sessionId: string) => {
      ensureSenderCleanup(event.sender)
      const ownerWindow = resolveOwnerWindow(event.sender)
      const workspacePath = getSessionWorkspacePath(sessionId)
      const snapshot = await withWorkspaceAccess(ownerWindow, workspacePath, () =>
        service.attachSession(sessionId, `renderer:${event.sender.id}`),
      )
      registerRendererSessionAttachment(event.sender.id, snapshot.sessionId)
      return snapshot
    },
    [IPC_CHANNELS.sessionDetach]: async (event: IpcInvokeEventLike, sessionId: string) => {
      const snapshot = await service.detachSession(sessionId, `renderer:${event.sender.id}`)
      removeRendererSessionAttachment(event.sender.id, sessionId)
      return snapshot
    },
    [IPC_CHANNELS.sessionAddUserMessage]: (
      _event,
      sessionId: string,
      message: string | LiveSessionAddUserMessageRequest,
    ) => service.addUserMessage(sessionId, message),
    [IPC_CHANNELS.sessionRename]: (_event, sessionId: string, title: string) =>
      service.renameSession(sessionId, title),
    [IPC_CHANNELS.sessionMoveProject]: (_event, sessionId: string, targetWorkspacePath: string) =>
      service.moveSessionProject(sessionId, targetWorkspacePath),
    [IPC_CHANNELS.sessionDelete]: (_event, sessionId: string) => service.deleteSession(sessionId),
    [IPC_CHANNELS.sessionListTools]: (_event, sessionId: string) =>
      service.listSessionTools(sessionId),
    [IPC_CHANNELS.sessionListSkills]: (_event, sessionId: string) =>
      service.listSessionSkills(sessionId),
    [IPC_CHANNELS.sessionListMcpServers]: (_event, sessionId: string) =>
      service.listSessionMcpServers(sessionId),
    [IPC_CHANNELS.sessionListMcpTools]: (_event, sessionId: string) =>
      service.listSessionMcpTools(sessionId),
    [IPC_CHANNELS.sessionListMcpRegistry]: (_event, sessionId: string) =>
      service.listSessionMcpRegistry(sessionId),
    [IPC_CHANNELS.sessionAddMcpServer]: (
      _event,
      sessionId: string,
      config: Parameters<FoundationService['addMcpServer']>[1],
    ) => service.addMcpServer(sessionId, config),
    [IPC_CHANNELS.sessionRemoveMcpServer]: (_event, sessionId: string, serverName: string) =>
      service.removeMcpServer(sessionId, serverName),
    [IPC_CHANNELS.sessionToggleMcpServer]: (
      _event,
      sessionId: string,
      serverName: string,
      enabled: boolean,
    ) => service.toggleMcpServer(sessionId, serverName, enabled),
    [IPC_CHANNELS.sessionAuthenticateMcpServer]: (_event, sessionId: string, serverName: string) =>
      service.authenticateMcpServer(sessionId, serverName),
    [IPC_CHANNELS.sessionCancelMcpAuth]: (_event, sessionId: string, serverName: string) =>
      service.cancelMcpAuth(sessionId, serverName),
    [IPC_CHANNELS.sessionClearMcpAuth]: (_event, sessionId: string, serverName: string) =>
      service.clearMcpAuth(sessionId, serverName),
    [IPC_CHANNELS.sessionSubmitMcpAuthCode]: (
      _event,
      sessionId: string,
      request: Parameters<FoundationService['submitMcpAuthCode']>[1],
    ) => service.submitMcpAuthCode(sessionId, request),
    [IPC_CHANNELS.sessionToggleMcpTool]: (
      _event,
      sessionId: string,
      serverName: string,
      toolName: string,
      enabled: boolean,
    ) => service.toggleMcpTool(sessionId, serverName, toolName, enabled),
    [IPC_CHANNELS.sessionKillWorkerSession]: (_event, sessionId: string, workerSessionId: string) =>
      service.killWorkerSession(sessionId, workerSessionId),
    [IPC_CHANNELS.sessionSubmitBugReport]: (
      _event,
      sessionId: string,
      request: Parameters<FoundationService['submitBugReport']>[1],
    ) => service.submitBugReport(sessionId, request),
    [IPC_CHANNELS.sessionGetContextStats]: (_event, sessionId: string) =>
      service.getSessionContextStats(sessionId),
    [IPC_CHANNELS.sessionUpdateSettings]: (
      _event,
      sessionId: string,
      settings: Record<string, unknown>,
    ) => service.updateSessionSettings(sessionId, settings),
    [IPC_CHANNELS.sessionInterrupt]: (_event, sessionId: string) =>
      service.interruptSession(sessionId),
    [IPC_CHANNELS.sessionFork]: async (
      event: IpcInvokeEventLike,
      sessionId: string,
      title?: string,
    ) => {
      ensureSenderCleanup(event.sender)
      const snapshot = await service.forkSession(sessionId, `renderer:${event.sender.id}`, title)
      registerRendererSessionAttachment(event.sender.id, snapshot.sessionId)
      return snapshot
    },
    [IPC_CHANNELS.sessionForkViaDaemon]: async (
      event: IpcInvokeEventLike,
      sessionId: string,
      title?: string,
    ) => {
      ensureSenderCleanup(event.sender)
      const snapshot = await service.forkSessionViaDaemon(
        sessionId,
        `renderer:${event.sender.id}`,
        title,
      )
      registerRendererSessionAttachment(event.sender.id, snapshot.sessionId)
      return snapshot
    },
    [IPC_CHANNELS.sessionRenameViaDaemon]: (_event, sessionId: string, title: string) =>
      service.renameSessionViaDaemon(sessionId, title),
    [IPC_CHANNELS.sessionGetRewindInfo]: (_event, sessionId: string, messageId: string) =>
      service.getRewindInfo(sessionId, messageId),
    [IPC_CHANNELS.sessionExecuteRewind]: async (
      event: IpcInvokeEventLike,
      sessionId: string,
      params: Parameters<FoundationService['executeRewind']>[1],
    ) => {
      ensureSenderCleanup(event.sender)
      const result = await service.executeRewind(sessionId, params, `renderer:${event.sender.id}`)
      registerRendererSessionAttachment(event.sender.id, result.snapshot.sessionId)
      return result
    },
    [IPC_CHANNELS.sessionCompact]: async (
      event: IpcInvokeEventLike,
      sessionId: string,
      customInstructions?: string,
    ) => {
      ensureSenderCleanup(event.sender)
      const result = await service.compactSession(
        sessionId,
        customInstructions,
        `renderer:${event.sender.id}`,
      )
      registerRendererSessionAttachment(event.sender.id, result.snapshot.sessionId)
      return result
    },
    [IPC_CHANNELS.sessionResolvePermissionRequest]: (
      _event,
      sessionId: string,
      requestId: string,
      selectedOption: string,
    ) => service.resolvePermissionRequest(sessionId, requestId, selectedOption),
    [IPC_CHANNELS.sessionResolveAskUserRequest]: (
      _event,
      sessionId: string,
      requestId: string,
      answers: unknown[],
    ) =>
      service.resolveAskUserRequest(
        sessionId,
        requestId,
        answers as Parameters<FoundationService['resolveAskUserRequest']>[2],
      ),
  }

  for (const [channel, handler] of Object.entries(handlers)) {
    registerHandler(channel, handler)
  }

  return () => {
    for (const channel of registeredChannels) {
      if (
        channel === IPC_CHANNELS.foundationBootstrap &&
        keepBootstrapHandlerOnCleanup &&
        lastBootstrapSnapshot === null
      ) {
        lastBootstrapSnapshot = service.getBootstrap()
      }

      ipcMain.removeHandler(channel)
    }

    if (keepBootstrapHandlerOnCleanup && lastBootstrapSnapshot !== null) {
      ipcMain.handle(IPC_CHANNELS.foundationBootstrap, () => lastBootstrapSnapshot)
    }

    for (const rendererId of rendererCleanupRegistered) {
      clearRendererSessionAttachments(rendererId)
    }
    rendererCleanupRegistered.clear()
  }
}

const MACOS_PROTECTED_HOME_DIRECTORIES = new Set(['Desktop', 'Documents', 'Downloads'])

function shouldRequestMacosDirectoryAccess(
  platform: NodeJS.Platform,
  workspacePath: string,
): boolean {
  if (platform !== 'darwin') {
    return false
  }

  const normalizedPath = resolveWorkspacePath(workspacePath)
  const homeDirectory = resolve(homedir())
  const relativePath = relative(homeDirectory, normalizedPath)
  const [topLevelDirectory] = relativePath.split(/[\\/]/u)

  return (
    Boolean(topLevelDirectory) &&
    !relativePath.startsWith('..') &&
    !relativePath.startsWith('/') &&
    MACOS_PROTECTED_HOME_DIRECTORIES.has(topLevelDirectory)
  )
}

function resolveWorkspacePath(workspacePath: string): string {
  const trimmed = workspacePath.trim()

  if (trimmed === '~' || trimmed.startsWith('~/')) {
    return resolve(homedir(), trimmed.slice(1))
  }

  return resolve(trimmed)
}

function isSameOrDescendantPath(candidatePath: string, ancestorPath: string): boolean {
  const relativePath = relative(ancestorPath, candidatePath)

  return relativePath === '' || (!relativePath.startsWith('..') && !relativePath.startsWith('/'))
}
