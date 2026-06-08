import { homedir } from 'node:os'
import { join } from 'node:path'

import type {
  DatabaseDiagnostics,
  FoundationBootstrap,
  FoundationChangedPayload,
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
  SessionRecord,
  SessionSearchIndexingProgress,
  SessionSearchRequest,
  SessionSearchResponse,
  SessionTranscript,
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
  createLocalPluginCapabilityProvider,
  createOxoxCapabilityGatewayServer,
} from './mcp/oxoxCapabilityGateway'
import type { LocalPluginHostManager } from './plugins/localPluginHost'
import { createLiveSessionSearchIndexScheduler } from './search/liveSessionSearchIndexScheduler'
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
  forkSession: (sessionId: string, viewerId?: string) => Promise<LiveSessionSnapshot>
  forkSessionViaDaemon: (sessionId: string, viewerId?: string) => Promise<LiveSessionSnapshot>
  renameSessionViaDaemon: (sessionId: string, title: string) => Promise<void>
  interruptSession: (sessionId: string) => Promise<void>
  getBootstrap: () => FoundationBootstrap
  getDatabaseDiagnostics: () => DatabaseDiagnostics
  listProjects: () => ProjectRecord[]
  listSessions: () => SessionRecord[]
  listSyncMetadata: () => SyncMetadataRecord[]
  listWorkspaceFiles: (request: WorkspaceFilesListRequest) => Promise<WorkspaceFilesListResponse>
  searchWorkspaceFiles: (
    request: WorkspaceFilesSearchRequest,
  ) => Promise<WorkspaceFilesSearchResponse>
  getWorkspaceFileContent: (
    request: WorkspaceFileContentRequest,
  ) => Promise<WorkspaceFileContentResponse>
  getSessionTranscript: (sessionId: string) => Promise<SessionTranscript>
  searchSessions: (request: SessionSearchRequest) => SessionSearchResponse
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
  const emitFoundationChanged = (): void => {
    foundationChangeBroadcaster?.broadcast()
  }
  const database = createDatabaseService(options)
  const factoryApi = createFactoryApiService()
  const droidCliStatus = resolveDroidCliStatus()
  let readDaemonDefaultSettings = async (): Promise<unknown> => null
  const foundationBootstrapState = createFoundationBootstrapState({
    droidPath: droidCliStatus.path ?? undefined,
    onChange: emitFoundationChanged,
    readDaemonDefaultSettings: () => readDaemonDefaultSettings(),
  })
  const scanner = createBackgroundArtifactScanner({
    userDataPath: options.userDataPath,
    sessionsRoot: join(homedir(), '.factory', 'sessions'),
  })
  const sessionsRoot = join(homedir(), '.factory', 'sessions')
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
  })
  const searchService = createSessionSearchService({
    bootstrap: queries.getBootstrap(),
    loadSessionTranscript: loadSessionTranscriptFromFile,
    searchDatabasePath: join(options.userDataPath, 'session-search.db'),
  })
  const liveSearchIndexScheduler = createLiveSessionSearchIndexScheduler({
    getSessionSnapshot: liveSessionRuntime.getSessionSnapshot,
    scheduleLiveSnapshotUpdate: searchService.scheduleLiveSnapshotUpdate,
  })
  foundationChangeBroadcaster = createFoundationChangeBroadcaster({
    getSnapshot: queries.getBootstrap,
    emit: (payload) => {
      searchService.replaceFoundation(queries.getBootstrap())
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
  foundationChangeBroadcaster.prime()
  const unsubscribeSearchLiveSnapshots = liveSessionRuntime.subscribeToSnapshots((sessionId) => {
    liveSearchIndexScheduler.schedule(sessionId)
  })
  daemonTransport.start()
  void foundationBootstrapState.refreshFromDroidCli()

  return {
    factoryApi,
    close: () => {
      sessionCatalog.close()
      unsubscribeSearchLiveSnapshots()
      liveSearchIndexScheduler.dispose()
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
    forkSessionViaDaemon: async (sessionId, viewerId) => {
      const snapshot = await daemonSessionControl.forkSession(sessionId, viewerId)
      emitFoundationChanged()
      return snapshot
    },
    renameSessionViaDaemon: async (sessionId, title) => {
      await daemonSessionControl.renameSession(sessionId, title)
      emitFoundationChanged()
    },
    interruptSession: liveSessionRuntime.interruptSession,
    getBootstrap: queries.getBootstrap,
    getDatabaseDiagnostics: queries.getDatabaseDiagnostics,
    listProjects: queries.listProjects,
    listSessions: queries.listSessions,
    listSyncMetadata: queries.listSyncMetadata,
    listWorkspaceFiles,
    searchWorkspaceFiles,
    getWorkspaceFileContent,
    getSessionTranscript: queries.getSessionTranscript,
    searchSessions: searchService.searchSessions,
    getSearchIndexingProgress: searchService.getIndexingProgress,
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

export {
  createFoundationBootstrapState,
  parseDroidExecHelpBootstrap,
  type ReadFoundationBootstrapOptions,
  readDroidExecHelp,
  readFactorySettingsBootstrap,
  readFoundationBootstrap,
}
