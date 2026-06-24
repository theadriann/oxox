import { homedir } from 'node:os'
import { join } from 'node:path'

import type {
  CreatePullRequestRequest,
  CreatePullRequestResponse,
  DatabaseDiagnostics,
  FoundationBootstrap,
  FoundationChangedPayload,
  GitActionResponse,
  GitCommitRequest,
  GitDiffRequest,
  GitDiffResponse,
  GitPushRequest,
  LiveSessionAddUserMessageRequest,
  LiveSessionAskUserAnswerRecord,
  LiveSessionBugReportRequest,
  LiveSessionBugReportResult,
  LiveSessionCompactResult,
  LiveSessionContextStatsInfo,
  LiveSessionCreateRequest,
  LiveSessionEventRecord,
  LiveSessionExecuteRewindParams,
  LiveSessionExecuteRewindResult,
  LiveSessionMcpAuthCodeRequest,
  LiveSessionMcpRegistryServerInfo,
  LiveSessionMcpServerConfig,
  LiveSessionMcpServerInfo,
  LiveSessionMcpToolInfo,
  LiveSessionNotificationSummary,
  LiveSessionRewindInfo,
  LiveSessionSettings,
  LiveSessionSkillInfo,
  LiveSessionSnapshot,
  LiveSessionToolInfo,
  ProjectRecord,
  SessionFolderAssignmentRecord,
  SessionFolderMetadata,
  SessionFolderRecord,
  SessionRecord,
  SessionReindexProgress,
  SessionReindexReport,
  SessionSearchIndexingProgress,
  SessionSearchRequest,
  SessionSearchResponse,
  SessionTranscript,
  SessionTranscriptScrollState,
  SyncMetadataRecord,
  WorkspaceFileContentRequest,
  WorkspaceFileContentResponse,
  WorkspaceFilesListRequest,
  WorkspaceFilesListResponse,
  WorkspaceFilesSearchRequest,
  WorkspaceFilesSearchResponse,
} from '../../shared/ipc/contracts'
import type { PluginRegistry } from '../app/PluginRegistry'
import { createBackgroundArtifactScanner } from './artifacts/backgroundScanner'
import { deleteSessionArtifacts } from './artifacts/deleteSessionArtifacts'
import type { ArtifactScannerProgress } from './artifacts/scanner'
import { createEnvironmentDaemonAuthProvider, type DaemonAuthProvider } from './daemon/auth'
import { createDaemonSessionControl } from './daemon/sessionControl'
import { createDaemonTransport, type DaemonTransport } from './daemon/transport'
import { type CreateDatabaseServiceOptions, createDatabaseService } from './database/service'
import { resolveDroidCliStatus } from './droid/resolveDroidCliStatus'
import { DroidSdkDaemonSessionTransport } from './droidSdk/daemonTransport'
import type { DroidSdkMcpServerFactory, DroidSdkProcessTransportConfig } from './droidSdk/factory'
import { DroidSdkSessionTransport } from './droidSdk/transport'
import { createFactoryApiService, type FactoryApiService } from './factoryApi/service'
import {
  createFoundationBootstrapState,
  parseDroidExecHelpBootstrap,
  type ReadFoundationBootstrapOptions,
  readDroidExecHelp,
  readFactorySettingsBootstrap,
  readFoundationBootstrap,
} from './foundation/bootstrap'
import { createFoundationChangeBroadcaster } from './foundation/changeBroadcaster'
import { createFoundationLiveSessionRuntime } from './foundation/liveSessionRuntime'
import { createFoundationQueries } from './foundation/queries'
import { createFoundationSessionCatalog } from './foundation/sessionCatalog'
import {
  commitLocalGitChanges,
  createLocalGitPullRequest,
  getLocalGitDiff,
  pushLocalGitBranch,
} from './git/localGitActions'
import {
  createLocalPluginCapabilityProvider,
  createOxoxCapabilityGatewayServer,
} from './mcp/oxoxCapabilityGateway'
import type { LocalPluginHostManager } from './plugins/localPluginHost'
import { createLiveSessionSearchIndexScheduler } from './search/liveSessionSearchIndexScheduler'
import { createBackgroundSessionSearchHydrator } from './search/sessionSearchHydrationWorker'
import { createSessionSearchService } from './search/sessionSearchService'
import { createSessionProcessManager } from './sessions/processManager'
import type { StreamJsonRpcProcessTransportLike } from './sessions/types'
import { loadSessionTranscriptFromFile } from './transcripts/service'
import {
  getLocalWorkspaceFileContent,
  listLocalWorkspaceFiles,
  searchLocalWorkspaceFiles,
} from './workspaceFiles/localWorkspaceFiles'
import { resolveWorkspaceFileAccessTarget } from './workspaceFiles/source'

export interface FoundationService {
  factoryApi: FactoryApiService
  close: () => void
  createSession: (
    request: LiveSessionCreateRequest,
    viewerId?: string,
  ) => Promise<LiveSessionSnapshot>
  getSessionSnapshot: (sessionId: string) => LiveSessionSnapshot | null
  listLiveSessionSnapshots: () => LiveSessionSnapshot[]
  listLiveSessionNotificationSummaries: () => LiveSessionNotificationSummary[]
  attachSession: (sessionId: string, viewerId?: string) => Promise<LiveSessionSnapshot>
  detachSession: (sessionId: string, viewerId?: string) => Promise<LiveSessionSnapshot>
  addUserMessage: (
    sessionId: string,
    message: string | LiveSessionAddUserMessageRequest,
  ) => Promise<void>
  listSessionTools: (sessionId: string) => Promise<LiveSessionToolInfo[]>
  listSessionSkills: (sessionId: string) => Promise<LiveSessionSkillInfo[]>
  listSessionMcpServers: (sessionId: string) => Promise<LiveSessionMcpServerInfo[]>
  listSessionMcpTools: (sessionId: string) => Promise<LiveSessionMcpToolInfo[]>
  listSessionMcpRegistry: (sessionId: string) => Promise<LiveSessionMcpRegistryServerInfo[]>
  addMcpServer: (sessionId: string, config: LiveSessionMcpServerConfig) => Promise<void>
  removeMcpServer: (sessionId: string, serverName: string) => Promise<void>
  toggleMcpServer: (sessionId: string, serverName: string, enabled: boolean) => Promise<void>
  authenticateMcpServer: (sessionId: string, serverName: string) => Promise<void>
  cancelMcpAuth: (sessionId: string, serverName: string) => Promise<void>
  clearMcpAuth: (sessionId: string, serverName: string) => Promise<void>
  submitMcpAuthCode: (sessionId: string, request: LiveSessionMcpAuthCodeRequest) => Promise<void>
  toggleMcpTool: (
    sessionId: string,
    serverName: string,
    toolName: string,
    enabled: boolean,
  ) => Promise<void>
  killWorkerSession: (sessionId: string, workerSessionId: string) => Promise<void>
  submitBugReport: (
    sessionId: string,
    request: LiveSessionBugReportRequest,
  ) => Promise<LiveSessionBugReportResult>
  getSessionContextStats: (sessionId: string) => Promise<LiveSessionContextStatsInfo | null>
  updateSessionSettings: (
    sessionId: string,
    settings: Partial<LiveSessionSettings>,
  ) => Promise<void>
  renameSession: (sessionId: string, title: string) => Promise<void>
  resolvePermissionRequest: (
    sessionId: string,
    requestId: string,
    selectedOption: string,
  ) => Promise<void>
  resolveAskUserRequest: (
    sessionId: string,
    requestId: string,
    answers: LiveSessionAskUserAnswerRecord[],
  ) => Promise<void>
  getRewindInfo: (sessionId: string, messageId: string) => Promise<LiveSessionRewindInfo>
  executeRewind: (
    sessionId: string,
    params: LiveSessionExecuteRewindParams,
    viewerId?: string,
  ) => Promise<LiveSessionExecuteRewindResult>
  compactSession: (
    sessionId: string,
    customInstructions?: string,
    viewerId?: string,
  ) => Promise<LiveSessionCompactResult>
  forkSession: (
    sessionId: string,
    viewerId?: string,
    title?: string,
  ) => Promise<LiveSessionSnapshot>
  forkSessionViaDaemon: (
    sessionId: string,
    viewerId?: string,
    title?: string,
  ) => Promise<LiveSessionSnapshot>
  renameSessionViaDaemon: (sessionId: string, title: string) => Promise<void>
  deleteSession: (sessionId: string) => Promise<void>
  interruptSession: (sessionId: string) => Promise<void>
  getBootstrap: () => FoundationBootstrap
  reindexSessions: () => Promise<SessionReindexReport>
  getDatabaseDiagnostics: () => DatabaseDiagnostics
  listProjects: () => ProjectRecord[]
  listSessions: () => SessionRecord[]
  listSyncMetadata: () => SyncMetadataRecord[]
  mergeSessionFolderMetadata: (metadata: SessionFolderMetadata) => Promise<void>
  upsertSessionFolder: (folder: SessionFolderRecord) => Promise<void>
  deleteSessionFolder: (folderId: string) => Promise<void>
  setSessionFolderAssignment: (assignment: SessionFolderAssignmentRecord) => Promise<void>
  removeSessionFolderAssignment: (sessionId: string) => Promise<void>
  listWorkspaceFiles: (request: WorkspaceFilesListRequest) => Promise<WorkspaceFilesListResponse>
  searchWorkspaceFiles: (
    request: WorkspaceFilesSearchRequest,
  ) => Promise<WorkspaceFilesSearchResponse>
  getWorkspaceFileContent: (
    request: WorkspaceFileContentRequest,
  ) => Promise<WorkspaceFileContentResponse>
  getGitDiff: (request: GitDiffRequest) => Promise<GitDiffResponse>
  commitGitChanges: (request: GitCommitRequest) => Promise<GitActionResponse>
  pushGitBranch: (request: GitPushRequest) => Promise<GitActionResponse>
  createGitPullRequest: (request: CreatePullRequestRequest) => Promise<CreatePullRequestResponse>
  getSessionTranscript: (sessionId: string) => Promise<SessionTranscript>
  getSessionTranscriptScrollState: (sessionId: string) => SessionTranscriptScrollState | null
  setSessionTranscriptScrollState: (state: SessionTranscriptScrollState) => void
  searchSessions: (request: SessionSearchRequest) => Promise<SessionSearchResponse>
  getSearchIndexingProgress: () => SessionSearchIndexingProgress
  subscribeToFoundationUpdates: (
    listener: (payload: FoundationChangedPayload) => void,
  ) => (() => void) | undefined
  subscribeToLiveSessionSnapshots: (
    listener: (sessionId: string) => void,
  ) => (() => void) | undefined
  subscribeToLiveSessionEvents: (
    listener: (payload: { sessionId: string; event: LiveSessionEventRecord }) => void,
  ) => (() => void) | undefined
}

export interface CreateFoundationSessionTransportFactoryOptions {
  authProvider: DaemonAuthProvider
  createMcpServers?: DroidSdkMcpServerFactory
  daemonTransport: Pick<DaemonTransport, 'listSessions'>
  createDaemonSessionTransport?: (options: {
    authProvider: DaemonAuthProvider
    cwd?: string
    sessionId?: string | null
  }) => StreamJsonRpcProcessTransportLike
  createProcessSessionTransport?: (
    config: DroidSdkProcessTransportConfig,
  ) => StreamJsonRpcProcessTransportLike
}

export function createFoundationSessionTransportFactory({
  authProvider,
  createMcpServers,
  daemonTransport,
  createDaemonSessionTransport = (options) => new DroidSdkDaemonSessionTransport(options),
  createProcessSessionTransport = (config) => new DroidSdkSessionTransport(config),
}: CreateFoundationSessionTransportFactoryOptions): (
  config: DroidSdkProcessTransportConfig,
) => StreamJsonRpcProcessTransportLike {
  return (config) => {
    const isDaemonSession =
      typeof config.sessionId === 'string' &&
      daemonTransport
        .listSessions()
        .some((session) => session.id === config.sessionId && session.transport === 'daemon')

    if (isDaemonSession) {
      return createDaemonSessionTransport({
        authProvider,
        cwd: config.cwd,
        sessionId: config.sessionId,
      })
    }

    return createProcessSessionTransport({
      ...config,
      ...(createMcpServers ? { createMcpServers } : {}),
    })
  }
}

export interface CreateFoundationServiceOptions extends CreateDatabaseServiceOptions {
  pluginHost?: Pick<LocalPluginHostManager, 'invokeCapability'>
  pluginRegistry?: PluginRegistry
}

export function createFoundationService(
  options: CreateFoundationServiceOptions,
): FoundationService {
  const foundationUpdateListeners = new Set<(payload: FoundationChangedPayload) => void>()
  const emitPayload = (payload: FoundationChangedPayload): void => {
    for (const listener of foundationUpdateListeners) {
      listener(payload)
    }
  }
  let foundationChangeBroadcaster: ReturnType<typeof createFoundationChangeBroadcaster> | null =
    null
  let sessionReindexProgress: SessionReindexProgress = createIdleSessionReindexProgress()
  const emitFoundationChanged = (): void => {
    foundationChangeBroadcaster?.broadcast()
  }
  const sessionReindexProgressBroadcaster = createThrottledSessionReindexProgressBroadcaster({
    emit: emitFoundationChanged,
  })
  const updateSessionReindexProgress = (progress: SessionReindexProgress): void => {
    sessionReindexProgress = progress
    sessionReindexProgressBroadcaster.notify(progress)
  }
  const database = createDatabaseService(options)
  const factoryApi = createFactoryApiService()
  const droidCliStatus = resolveDroidCliStatus()
  const disableArtifactScanner = process.env.OXOX_DISABLE_ARTIFACT_SCANNER === '1'
  const disableSearchService = process.env.OXOX_DISABLE_SEARCH_SERVICE === '1'
  const sessionsRoot = join(homedir(), '.factory', 'sessions')
  let readDaemonDefaultSettings = async (): Promise<unknown> => null
  const foundationBootstrapState = createFoundationBootstrapState({
    droidPath: droidCliStatus.path ?? undefined,
    onChange: emitFoundationChanged,
    readDaemonDefaultSettings: () => readDaemonDefaultSettings(),
  })
  const scanner = disableArtifactScanner
    ? createNoopArtifactScanner()
    : createBackgroundArtifactScanner({
        userDataPath: options.userDataPath,
        sessionsRoot,
      })
  const daemonAuthProvider = createEnvironmentDaemonAuthProvider()
  const daemonTransport = createDaemonTransport({
    authProvider: daemonAuthProvider,
    onStateChange: (snapshot) => {
      emitFoundationChanged()

      if (snapshot.status === 'connected') {
        void foundationBootstrapState.refreshFromDaemonDefaults()
        return
      }

      foundationBootstrapState.clearDaemonDefaultSettings()
    },
  })
  readDaemonDefaultSettings = () => daemonTransport.getDefaultSettings()
  const localPluginCapabilityProvider =
    options.pluginRegistry && options.pluginHost
      ? createLocalPluginCapabilityProvider({
          pluginRegistry: options.pluginRegistry,
          pluginHost: options.pluginHost,
        })
      : null
  const createMcpServers: DroidSdkMcpServerFactory | undefined = localPluginCapabilityProvider
    ? ({ getSessionId }) => [
        createOxoxCapabilityGatewayServer({
          provider: localPluginCapabilityProvider,
          getSessionId,
        }),
      ]
    : undefined
  const sessionProcessManager = createSessionProcessManager({
    database,
    droidPath: droidCliStatus.path ?? undefined,
    sessionsRoot,
    sessionTransportFactory: createFoundationSessionTransportFactory({
      authProvider: daemonAuthProvider,
      createMcpServers,
      daemonTransport,
    }),
  })
  const liveSessionRuntime = createFoundationLiveSessionRuntime({
    onChange: emitFoundationChanged,
    sessionProcessManager,
  })
  const sessionCatalog = createFoundationSessionCatalog({
    database,
    scanner,
    daemonTransport,
    onChange: emitFoundationChanged,
  })
  const queries = createFoundationQueries({
    database,
    sessionCatalog,
    daemonTransport,
    droidCliStatus,
    getFactorySettingsBootstrap: foundationBootstrapState.getSnapshot,
    getSessionReindexProgress: () => sessionReindexProgress,
  })
  const searchDatabasePath = join(options.userDataPath, 'session-search.db')
  const searchHydrationOptions = {
    backgroundHydrationBatchDelayMs: 2_000,
    backgroundHydrationBatchSize: 1,
    backgroundHydrationLimit: 50,
    bootstrap: queries.getBootstrap(),
    hydrationYieldMs: 250,
    maxIndexedContentChars: 20_000,
    maxIndexedToolChars: 10_000,
    persistFoundationMetadata: false,
    searchDatabasePath,
  }
  const searchService = disableSearchService
    ? createNoopSessionSearchService()
    : createSessionSearchService({
        bootstrap: searchHydrationOptions.bootstrap,
        loadSessionTranscript: loadSessionTranscriptFromFile,
        backgroundHydrationBatchDelayMs: searchHydrationOptions.backgroundHydrationBatchDelayMs,
        backgroundHydrationBatchSize: searchHydrationOptions.backgroundHydrationBatchSize,
        backgroundHydrationLimit: 0,
        hydrationYieldMs: searchHydrationOptions.hydrationYieldMs,
        maxIndexedContentChars: searchHydrationOptions.maxIndexedContentChars,
        maxIndexedToolChars: searchHydrationOptions.maxIndexedToolChars,
        searchDatabasePath,
      })
  const searchHydrator = disableSearchService
    ? createNoopSessionSearchHydrator()
    : createBackgroundSessionSearchHydrator(searchHydrationOptions)
  const liveSearchIndexScheduler = createLiveSessionSearchIndexScheduler({
    getSessionSnapshot: liveSessionRuntime.getSessionSnapshot,
    scheduleLiveSnapshotUpdate: searchService.scheduleLiveSnapshotUpdate,
  })
  foundationChangeBroadcaster = createFoundationChangeBroadcaster({
    getSnapshot: queries.getBootstrap,
    emit: (payload) => {
      const bootstrap = queries.getBootstrap()
      searchService.replaceFoundation(bootstrap, {
        persistMetadata: false,
        scheduleHydration: false,
      })
      searchHydrator.replaceFoundation(bootstrap)
      emitPayload(payload)
    },
  })
  const daemonSessionControl = createDaemonSessionControl({
    daemonTransport,
    liveSessionRuntime,
    sessionCatalog,
    sessionsRoot,
  })
  const resolveWorkspaceFileAccessTargetForSession = (sessionId: string) => {
    const catalogSessions = sessionCatalog.listSessions()
    return resolveWorkspaceFileAccessTarget({
      sessionId,
      catalogSessions,
      liveSessions: liveSessionRuntime.listLiveSessionSnapshots(),
      isDaemonBackedSession: catalogSessions.some(
        (session) => session.id === sessionId && session.transport === 'daemon',
      ),
    })
  }
  const listWorkspaceFiles = async (
    request: WorkspaceFilesListRequest,
  ): Promise<WorkspaceFilesListResponse> => {
    const target = resolveWorkspaceFileAccessTargetForSession(request.sessionId)

    if (target.kind === 'daemon') {
      return daemonTransport.listFiles(request)
    }

    return listLocalWorkspaceFiles({
      workspacePath: target.workspacePath,
      showHidden: request.showHidden,
    })
  }
  const searchWorkspaceFiles = async (
    request: WorkspaceFilesSearchRequest,
  ): Promise<WorkspaceFilesSearchResponse> => {
    const target = resolveWorkspaceFileAccessTargetForSession(request.sessionId)

    if (target.kind === 'daemon') {
      return daemonTransport.searchFiles(request)
    }

    return searchLocalWorkspaceFiles({
      workspacePath: target.workspacePath,
      query: request.query,
      maxResults: request.maxResults,
      showHidden: request.showHidden,
    })
  }
  const getWorkspaceFileContent = async (
    request: WorkspaceFileContentRequest,
  ): Promise<WorkspaceFileContentResponse> => {
    const target = resolveWorkspaceFileAccessTargetForSession(request.sessionId)
    const result =
      target.kind === 'daemon'
        ? await daemonTransport.getWorkspaceFileContent(request)
        : await getLocalWorkspaceFileContent({
            workspacePath: target.workspacePath,
            filePath: request.filePath,
            encoding: request.encoding,
          })

    return {
      content: result.content,
      byteLength: result.byteLength,
      encoding: result.encoding ?? 'utf8',
      mimeType: result.mimeType ?? null,
      isBinary: result.isBinary ?? false,
    }
  }
  const resolveGitActionTargetForSession = (sessionId: string) => {
    const catalogSessions = sessionCatalog.listSessions()
    return resolveWorkspaceFileAccessTarget({
      sessionId,
      catalogSessions,
      liveSessions: liveSessionRuntime.listLiveSessionSnapshots(),
      isDaemonBackedSession: catalogSessions.some(
        (session) => session.id === sessionId && session.transport === 'daemon',
      ),
    })
  }
  const getGitDiff = async (request: GitDiffRequest): Promise<GitDiffResponse> => {
    const target = resolveGitActionTargetForSession(request.sessionId)
    if (target.kind === 'local') {
      return getLocalGitDiff({ ...request, workspacePath: target.workspacePath })
    }

    return daemonTransport.getGitDiff(request)
  }
  const commitGitChanges = async (request: GitCommitRequest): Promise<GitActionResponse> => {
    const target = resolveGitActionTargetForSession(request.sessionId)
    const result =
      target.kind === 'local'
        ? await commitLocalGitChanges({ ...request, workspacePath: target.workspacePath })
        : await daemonTransport.gitCommit(request)
    emitFoundationChanged()
    return result
  }
  const pushGitBranch = async (request: GitPushRequest): Promise<GitActionResponse> => {
    const target = resolveGitActionTargetForSession(request.sessionId)
    const result =
      target.kind === 'local'
        ? await pushLocalGitBranch({ ...request, workspacePath: target.workspacePath })
        : await daemonTransport.gitPush(request)
    emitFoundationChanged()
    return result
  }
  const createGitPullRequest = async (
    request: CreatePullRequestRequest,
  ): Promise<CreatePullRequestResponse> => {
    const target = resolveGitActionTargetForSession(request.sessionId)
    const result =
      target.kind === 'local'
        ? await createLocalGitPullRequest({ ...request, workspacePath: target.workspacePath })
        : await daemonTransport.createPullRequest(request)
    emitFoundationChanged()
    return result
  }
  foundationChangeBroadcaster.prime()
  const unsubscribeSearchLiveSnapshots = liveSessionRuntime.subscribeToSnapshots((sessionId) => {
    liveSearchIndexScheduler.schedule(sessionId)
  })
  daemonTransport.start()
  void foundationBootstrapState.refreshFromDroidCli()

  return {
    factoryApi,
    close: () => {
      sessionReindexProgressBroadcaster.dispose()
      sessionCatalog.close()
      unsubscribeSearchLiveSnapshots()
      liveSearchIndexScheduler.dispose()
      void searchHydrator.close()
      searchService.dispose()
      void daemonTransport.stop()
      void liveSessionRuntime.dispose()
      database.close()
    },
    createSession: liveSessionRuntime.createSession,
    getSessionSnapshot: liveSessionRuntime.getSessionSnapshot,
    listLiveSessionSnapshots: liveSessionRuntime.listLiveSessionSnapshots,
    listLiveSessionNotificationSummaries: liveSessionRuntime.listLiveSessionNotificationSummaries,
    attachSession: liveSessionRuntime.attachSession,
    detachSession: liveSessionRuntime.detachSession,
    addUserMessage: liveSessionRuntime.addUserMessage,
    listSessionTools: liveSessionRuntime.listSessionTools,
    listSessionSkills: liveSessionRuntime.listSessionSkills,
    listSessionMcpServers: liveSessionRuntime.listSessionMcpServers,
    listSessionMcpTools: liveSessionRuntime.listSessionMcpTools,
    listSessionMcpRegistry: liveSessionRuntime.listSessionMcpRegistry,
    addMcpServer: liveSessionRuntime.addMcpServer,
    removeMcpServer: liveSessionRuntime.removeMcpServer,
    toggleMcpServer: liveSessionRuntime.toggleMcpServer,
    authenticateMcpServer: liveSessionRuntime.authenticateMcpServer,
    cancelMcpAuth: liveSessionRuntime.cancelMcpAuth,
    clearMcpAuth: liveSessionRuntime.clearMcpAuth,
    submitMcpAuthCode: liveSessionRuntime.submitMcpAuthCode,
    toggleMcpTool: liveSessionRuntime.toggleMcpTool,
    killWorkerSession: liveSessionRuntime.killWorkerSession,
    submitBugReport: liveSessionRuntime.submitBugReport,
    getSessionContextStats: liveSessionRuntime.getSessionContextStats,
    renameSession: async (sessionId, title) => {
      await liveSessionRuntime.renameSession(sessionId, title)
      emitFoundationChanged()
    },
    deleteSession: async (sessionId) => {
      const sourcePath =
        database.listSyncMetadata().find((metadata) => metadata.sessionId === sessionId)
          ?.sourcePath ?? null

      await liveSessionRuntime.deleteSession(sessionId)
      deleteSessionArtifacts({
        sessionsRoot,
        sessionId,
        sourcePath,
      })
      searchService.deleteSession(sessionId)
      database.removeSession(sessionId)
      emitFoundationChanged()
    },
    updateSessionSettings: liveSessionRuntime.updateSessionSettings,
    resolvePermissionRequest: liveSessionRuntime.resolvePermissionRequest,
    resolveAskUserRequest: liveSessionRuntime.resolveAskUserRequest,
    getRewindInfo: liveSessionRuntime.getRewindInfo,
    executeRewind: async (sessionId, params, viewerId) => {
      const result = await liveSessionRuntime.executeRewind(sessionId, params, viewerId)
      emitFoundationChanged()
      return result
    },
    compactSession: async (sessionId, customInstructions, viewerId) => {
      const result = await liveSessionRuntime.compactSession(
        sessionId,
        customInstructions,
        viewerId,
      )
      emitFoundationChanged()
      return result
    },
    forkSession: liveSessionRuntime.forkSession,
    forkSessionViaDaemon: async (sessionId, viewerId, title) => {
      const snapshot = await daemonSessionControl.forkSession(sessionId, viewerId, title)
      emitFoundationChanged()
      return snapshot
    },
    renameSessionViaDaemon: async (sessionId, title) => {
      await daemonSessionControl.renameSession(sessionId, title)
      emitFoundationChanged()
    },
    interruptSession: liveSessionRuntime.interruptSession,
    getBootstrap: queries.getBootstrap,
    reindexSessions: async () => {
      updateSessionReindexProgress(createPreparingSessionReindexProgress())

      try {
        const report = await sessionCatalog.reindexArtifacts((progress) => {
          updateSessionReindexProgress(mapArtifactProgressToSessionProgress(progress))
        })
        updateSessionReindexProgress(
          createDoneSessionReindexProgress(report, sessionReindexProgress),
        )
        return report
      } catch (error) {
        updateSessionReindexProgress(
          createErroredSessionReindexProgress(
            error instanceof Error ? error.message : String(error),
            sessionReindexProgress,
          ),
        )
        throw error
      }
    },
    getDatabaseDiagnostics: queries.getDatabaseDiagnostics,
    listProjects: queries.listProjects,
    listSessions: queries.listSessions,
    listSyncMetadata: queries.listSyncMetadata,
    mergeSessionFolderMetadata: async (metadata) => {
      database.mergeSessionFolderMetadata(metadata)
      emitFoundationChanged()
    },
    upsertSessionFolder: async (folder) => {
      database.upsertSessionFolder(folder)
      emitFoundationChanged()
    },
    deleteSessionFolder: async (folderId) => {
      database.deleteSessionFolder(folderId)
      emitFoundationChanged()
    },
    setSessionFolderAssignment: async (assignment) => {
      database.setSessionFolderAssignment(assignment)
      emitFoundationChanged()
    },
    removeSessionFolderAssignment: async (sessionId) => {
      database.removeSessionFolderAssignment(sessionId)
      emitFoundationChanged()
    },
    listWorkspaceFiles,
    searchWorkspaceFiles,
    getWorkspaceFileContent,
    getGitDiff,
    commitGitChanges,
    pushGitBranch,
    createGitPullRequest,
    getSessionTranscript: queries.getSessionTranscript,
    getSessionTranscriptScrollState: queries.getSessionTranscriptScrollState,
    setSessionTranscriptScrollState: queries.setSessionTranscriptScrollState,
    searchSessions: async (request) => {
      try {
        return await searchHydrator.searchSessions(request)
      } catch {
        return searchService.searchSessions(request)
      }
    },
    getSearchIndexingProgress: searchHydrator.getIndexingProgress,
    subscribeToFoundationUpdates: (listener) => {
      foundationUpdateListeners.add(listener)

      return () => {
        foundationUpdateListeners.delete(listener)
      }
    },
    subscribeToLiveSessionSnapshots: liveSessionRuntime.subscribeToSnapshots,
    subscribeToLiveSessionEvents: liveSessionRuntime.subscribeToEvents,
  }
}

const SESSION_REINDEX_PROGRESS_THROTTLE_MS = 200

type TimeoutHandle = ReturnType<typeof setTimeout>

interface ThrottledSessionReindexProgressBroadcasterOptions {
  clearTimeoutFn?: (handle: TimeoutHandle) => void
  emit: () => void
  nowFn?: () => number
  setTimeoutFn?: (callback: () => void, delayMs: number) => TimeoutHandle
  throttleMs?: number
}

function createThrottledSessionReindexProgressBroadcaster({
  clearTimeoutFn = clearTimeout,
  emit,
  nowFn = Date.now,
  setTimeoutFn = setTimeout,
  throttleMs = SESSION_REINDEX_PROGRESS_THROTTLE_MS,
}: ThrottledSessionReindexProgressBroadcasterOptions): {
  dispose: () => void
  notify: (progress: SessionReindexProgress) => void
} {
  let lastEmittedAt = Number.NEGATIVE_INFINITY
  let pendingTimer: TimeoutHandle | null = null

  const clearPendingTimer = (): void => {
    if (!pendingTimer) {
      return
    }

    clearTimeoutFn(pendingTimer)
    pendingTimer = null
  }

  const emitNow = (): void => {
    clearPendingTimer()
    lastEmittedAt = nowFn()
    emit()
  }

  const shouldEmitImmediately = (progress: SessionReindexProgress): boolean =>
    progress.phase !== 'indexing'

  return {
    dispose: clearPendingTimer,
    notify: (progress) => {
      if (shouldEmitImmediately(progress)) {
        emitNow()
        return
      }

      const elapsedMs = nowFn() - lastEmittedAt
      if (elapsedMs >= throttleMs) {
        emitNow()
        return
      }

      if (pendingTimer) {
        return
      }

      pendingTimer = setTimeoutFn(() => {
        pendingTimer = null
        lastEmittedAt = nowFn()
        emit()
      }, throttleMs - elapsedMs)
    },
  }
}

function createNoopArtifactScanner(): ReturnType<typeof createBackgroundArtifactScanner> {
  return {
    sync: async () => ({
      deletedCount: 0,
      durationMs: 0,
      processedCount: 0,
      skippedCount: 0,
      unreadableCount: 0,
    }),
    close: async () => {},
  }
}

function createIdleSessionReindexProgress(): SessionReindexProgress {
  return {
    phase: 'idle',
    totalCount: 0,
    visitedCount: 0,
    processedCount: 0,
    skippedCount: 0,
    unreadableCount: 0,
    deletedCount: 0,
    startedAt: null,
    updatedAt: null,
    completedAt: null,
    error: null,
  }
}

function createPreparingSessionReindexProgress(): SessionReindexProgress {
  const now = new Date().toISOString()

  return {
    ...createIdleSessionReindexProgress(),
    phase: 'preparing',
    startedAt: now,
    updatedAt: now,
  }
}

function mapArtifactProgressToSessionProgress(
  progress: ArtifactScannerProgress,
): SessionReindexProgress {
  return {
    phase: progress.phase,
    totalCount: progress.totalCount,
    visitedCount: progress.visitedCount,
    processedCount: progress.processedCount,
    skippedCount: progress.skippedCount,
    unreadableCount: progress.unreadableCount,
    deletedCount: progress.deletedCount,
    startedAt: progress.startedAt,
    updatedAt: progress.updatedAt,
    completedAt: progress.phase === 'done' ? progress.updatedAt : null,
    error: null,
  }
}

function createDoneSessionReindexProgress(
  report: SessionReindexReport,
  previous: SessionReindexProgress,
): SessionReindexProgress {
  const now = new Date().toISOString()

  return {
    phase: 'done',
    totalCount: Math.max(previous.totalCount, previous.visitedCount),
    visitedCount: Math.max(previous.visitedCount, previous.totalCount),
    processedCount: report.processedCount,
    skippedCount: report.skippedCount,
    unreadableCount: report.unreadableCount,
    deletedCount: report.deletedCount,
    startedAt: previous.startedAt,
    updatedAt: now,
    completedAt: now,
    error: null,
  }
}

function createErroredSessionReindexProgress(
  error: string,
  previous: SessionReindexProgress,
): SessionReindexProgress {
  const now = new Date().toISOString()

  return {
    ...previous,
    phase: 'error',
    updatedAt: now,
    completedAt: now,
    error,
  }
}

function createNoopSessionSearchService(): ReturnType<typeof createSessionSearchService> {
  return {
    searchSessions: (request) => ({
      hits: [],
      query: request.query,
      matches: [],
    }),
    getIndexingProgress: () => ({
      indexedSessions: 0,
      totalSessions: 0,
      isIndexing: false,
      updatedAt: new Date().toISOString(),
    }),
    deleteSession: () => {},
    replaceFoundation: () => {},
    scheduleLiveSnapshotUpdate: () => {},
    waitForHydration: async () => {},
    dispose: () => {},
  }
}

function createNoopSessionSearchHydrator(): ReturnType<
  typeof createBackgroundSessionSearchHydrator
> {
  return {
    getIndexingProgress: () => ({
      indexedSessions: 0,
      totalSessions: 0,
      isIndexing: false,
      updatedAt: new Date().toISOString(),
    }),
    replaceFoundation: () => {},
    searchSessions: async (request) => ({
      hits: [],
      matches: [],
      query: request.query,
    }),
    close: async () => {},
  }
}

export {
  createFoundationBootstrapState,
  createThrottledSessionReindexProgressBroadcaster,
  parseDroidExecHelpBootstrap,
  type ReadFoundationBootstrapOptions,
  readDroidExecHelp,
  readFactorySettingsBootstrap,
  readFoundationBootstrap,
}
