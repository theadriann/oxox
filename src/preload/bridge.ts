import type {
  AppUpdateState,
  AppUpdateStateChangedPayload,
  FactoryApiCreateComputerResponse,
  FactoryApiGetComputerByNameResponse,
  FactoryApiGetComputerMetricsResponse,
  FactoryApiGetComputerResponse,
  FactoryApiGetMachineTemplateResponse,
  FactoryApiListComputersResponse,
  FactoryApiListMachineTemplatesResponse,
  FactoryApiListRemoteSessionsResponse,
  FactoryApiRefreshComputerResponse,
  FactoryApiRetryInstallDepsResponse,
  FactoryApiUpdateComputerResponse,
  FoundationBootstrap,
  FoundationChangedPayload,
  LiveSessionCompactResult,
  LiveSessionContextStatsInfo,
  LiveSessionEventBatchPayload,
  LiveSessionExecuteRewindResult,
  LiveSessionMcpRegistryServerInfo,
  LiveSessionMcpServerInfo,
  LiveSessionMcpToolInfo,
  LiveSessionRewindInfo,
  LiveSessionSkillInfo,
  LiveSessionSnapshot,
  LiveSessionSnapshotChangedPayload,
  LiveSessionToolInfo,
  NotificationNavigationPayload,
  OxoxBridge,
  PluginCapabilitiesChangedPayload,
  PluginHostChangedPayload,
  PluginHostSnapshot,
  ProjectRecord,
  RuntimeInfo,
  SessionRecord,
  SessionSearchIndexingProgress,
  SessionSearchRequest,
  SessionSearchResponse,
  SessionTranscript,
  SyncMetadataRecord,
  WorkspaceFileContentResponse,
  WorkspaceFilesListResponse,
  WorkspaceFilesSearchResponse,
} from '../shared/ipc/contracts'
import { IPC_CHANNELS } from '../shared/ipc/contracts'

export type InvokeHandler = <TResult>(channel: string) => Promise<TResult>

export type InvokeHandlerWithArgs = <TResult>(
  channel: string,
  ...args: unknown[]
) => Promise<TResult>

export type SubscribeHandler = (
  channel: string,
  listener: (event: unknown, payload: unknown) => void,
) => void

export type UnsubscribeHandler = (
  channel: string,
  listener: (event: unknown, payload: unknown) => void,
) => void

function invokeTyped<TResult>(
  invoke: InvokeHandlerWithArgs,
  channel: string,
  ...args: unknown[]
): Promise<TResult> {
  return invoke<TResult>(channel, ...args)
}

function subscribeTyped<TPayload>(
  on: SubscribeHandler,
  off: UnsubscribeHandler,
  channel: string,
  listener: (payload: TPayload) => void,
): () => void {
  const wrappedListener = (_event: unknown, payload: unknown) => {
    listener(payload as TPayload)
  }

  on(channel, wrappedListener)

  return () => {
    off(channel, wrappedListener)
  }
}

export function createOxoxBridge(
  invoke: InvokeHandlerWithArgs,
  on: SubscribeHandler = () => undefined,
  off: UnsubscribeHandler = () => undefined,
  getPathForFile: (file: File) => string | null = () => null,
): OxoxBridge {
  return {
    runtime: {
      getInfo: () => invokeTyped<RuntimeInfo>(invoke, IPC_CHANNELS.runtimeInfo),
    },
    app: {
      getUpdateState: () => invokeTyped<AppUpdateState>(invoke, IPC_CHANNELS.appGetUpdateState),
      checkForUpdates: () => invokeTyped<AppUpdateState>(invoke, IPC_CHANNELS.appCheckForUpdates),
      installUpdate: () => invokeTyped<void>(invoke, IPC_CHANNELS.appInstallUpdate),
      onNotificationNavigation: (listener) =>
        subscribeTyped<NotificationNavigationPayload>(
          on,
          off,
          IPC_CHANNELS.appNotificationNavigation,
          listener,
        ),
      onUpdateStateChanged: (listener) =>
        subscribeTyped<AppUpdateStateChangedPayload>(
          on,
          off,
          IPC_CHANNELS.appUpdateStateChanged,
          listener,
        ),
      openNewWindow: () => invokeTyped<void>(invoke, IPC_CHANNELS.appOpenWindow),
    },
    diagnostics: {
      logTranscriptPerformance: (events) =>
        invokeTyped<void>(invoke, IPC_CHANNELS.diagnosticsLogTranscriptPerformance, events),
    },
    plugin: {
      listCapabilities: () => invokeTyped(invoke, IPC_CHANNELS.pluginListCapabilities),
      listHosts: () => invokeTyped<PluginHostSnapshot[]>(invoke, IPC_CHANNELS.pluginListHosts),
      invokeCapability: (capabilityId, payload) =>
        invokeTyped(invoke, IPC_CHANNELS.pluginInvokeCapability, capabilityId, payload),
      onCapabilitiesChanged: (listener) =>
        subscribeTyped<PluginCapabilitiesChangedPayload>(
          on,
          off,
          IPC_CHANNELS.pluginCapabilitiesChanged,
          listener,
        ),
      onHostChanged: (listener) =>
        subscribeTyped<PluginHostChangedPayload>(on, off, IPC_CHANNELS.pluginHostChanged, listener),
    },
    dialog: {
      selectDirectory: () => invokeTyped<string | null>(invoke, IPC_CHANNELS.dialogSelectDirectory),
      getPathForFile,
    },
    foundation: {
      getBootstrap: () =>
        invokeTyped<FoundationBootstrap>(invoke, IPC_CHANNELS.foundationBootstrap),
      onChanged: (listener) =>
        subscribeTyped<FoundationChangedPayload>(on, off, IPC_CHANNELS.foundationChanged, listener),
    },
    database: {
      listProjects: () => invokeTyped<ProjectRecord[]>(invoke, IPC_CHANNELS.databaseListProjects),
      listSessions: () => invokeTyped<SessionRecord[]>(invoke, IPC_CHANNELS.databaseListSessions),
      listSyncMetadata: () =>
        invokeTyped<SyncMetadataRecord[]>(invoke, IPC_CHANNELS.databaseListSyncMetadata),
    },
    workspaceFiles: {
      list: (request) =>
        invokeTyped<WorkspaceFilesListResponse>(invoke, IPC_CHANNELS.workspaceFilesList, request),
      search: (request) =>
        invokeTyped<WorkspaceFilesSearchResponse>(
          invoke,
          IPC_CHANNELS.workspaceFilesSearch,
          request,
        ),
      getContent: (request) =>
        invokeTyped<WorkspaceFileContentResponse>(
          invoke,
          IPC_CHANNELS.workspaceFilesGetContent,
          request,
        ),
    },
    factoryApi: {
      listMachineTemplates: (request = {}) =>
        invokeTyped<FactoryApiListMachineTemplatesResponse>(
          invoke,
          IPC_CHANNELS.factoryApiListMachineTemplates,
          request,
        ),
      getMachineTemplate: (request) =>
        invokeTyped<FactoryApiGetMachineTemplateResponse>(
          invoke,
          IPC_CHANNELS.factoryApiGetMachineTemplate,
          request,
        ),
      listComputers: (request = {}) =>
        invokeTyped<FactoryApiListComputersResponse>(
          invoke,
          IPC_CHANNELS.factoryApiListComputers,
          request,
        ),
      getComputer: (request) =>
        invokeTyped<FactoryApiGetComputerResponse>(
          invoke,
          IPC_CHANNELS.factoryApiGetComputer,
          request,
        ),
      createComputer: (request) =>
        invokeTyped<FactoryApiCreateComputerResponse>(
          invoke,
          IPC_CHANNELS.factoryApiCreateComputer,
          request,
        ),
      getComputerByName: (request) =>
        invokeTyped<FactoryApiGetComputerByNameResponse>(
          invoke,
          IPC_CHANNELS.factoryApiGetComputerByName,
          request,
        ),
      updateComputer: (request) =>
        invokeTyped<FactoryApiUpdateComputerResponse>(
          invoke,
          IPC_CHANNELS.factoryApiUpdateComputer,
          request,
        ),
      deleteComputer: (request) =>
        invokeTyped<void>(invoke, IPC_CHANNELS.factoryApiDeleteComputer, request),
      restartComputer: (request) =>
        invokeTyped<void>(invoke, IPC_CHANNELS.factoryApiRestartComputer, request),
      refreshComputer: (request) =>
        invokeTyped<FactoryApiRefreshComputerResponse>(
          invoke,
          IPC_CHANNELS.factoryApiRefreshComputer,
          request,
        ),
      getComputerMetrics: (request) =>
        invokeTyped<FactoryApiGetComputerMetricsResponse>(
          invoke,
          IPC_CHANNELS.factoryApiGetComputerMetrics,
          request,
        ),
      retryInstallDeps: (request) =>
        invokeTyped<FactoryApiRetryInstallDepsResponse>(
          invoke,
          IPC_CHANNELS.factoryApiRetryInstallDeps,
          request,
        ),
      listRemoteSessions: (request = {}) =>
        invokeTyped<FactoryApiListRemoteSessionsResponse>(
          invoke,
          IPC_CHANNELS.factoryApiListRemoteSessions,
          request,
        ),
    },
    transcript: {
      getSessionTranscript: (sessionId) =>
        invokeTyped<SessionTranscript>(
          invoke,
          IPC_CHANNELS.transcriptGetSessionTranscript,
          sessionId,
        ),
    },
    search: {
      sessions: (request: SessionSearchRequest) =>
        invokeTyped<SessionSearchResponse>(invoke, IPC_CHANNELS.sessionSearch, request),
      indexingProgress: () =>
        invokeTyped<SessionSearchIndexingProgress>(
          invoke,
          IPC_CHANNELS.sessionSearchIndexingProgress,
        ),
    },
    session: {
      create: (request) =>
        invokeTyped<LiveSessionSnapshot>(invoke, IPC_CHANNELS.sessionCreate, request),
      getSnapshot: (sessionId) =>
        invokeTyped<LiveSessionSnapshot | null>(invoke, IPC_CHANNELS.sessionGetSnapshot, sessionId),
      attach: (sessionId) =>
        invokeTyped<LiveSessionSnapshot>(invoke, IPC_CHANNELS.sessionAttach, sessionId),
      detach: (sessionId) =>
        invokeTyped<LiveSessionSnapshot>(invoke, IPC_CHANNELS.sessionDetach, sessionId),
      addUserMessage: (sessionId, text) =>
        invokeTyped<void>(invoke, IPC_CHANNELS.sessionAddUserMessage, sessionId, text),
      rename: (sessionId, title) =>
        invokeTyped<void>(invoke, IPC_CHANNELS.sessionRename, sessionId, title),
      listTools: (sessionId) =>
        invokeTyped<LiveSessionToolInfo[]>(invoke, IPC_CHANNELS.sessionListTools, sessionId),
      listSkills: (sessionId) =>
        invokeTyped<LiveSessionSkillInfo[]>(invoke, IPC_CHANNELS.sessionListSkills, sessionId),
      listMcpServers: (sessionId) =>
        invokeTyped<LiveSessionMcpServerInfo[]>(
          invoke,
          IPC_CHANNELS.sessionListMcpServers,
          sessionId,
        ),
      listMcpTools: (sessionId) =>
        invokeTyped<LiveSessionMcpToolInfo[]>(invoke, IPC_CHANNELS.sessionListMcpTools, sessionId),
      listMcpRegistry: (sessionId) =>
        invokeTyped<LiveSessionMcpRegistryServerInfo[]>(
          invoke,
          IPC_CHANNELS.sessionListMcpRegistry,
          sessionId,
        ),
      addMcpServer: (sessionId, config) =>
        invokeTyped<void>(invoke, IPC_CHANNELS.sessionAddMcpServer, sessionId, config),
      removeMcpServer: (sessionId, serverName) =>
        invokeTyped<void>(invoke, IPC_CHANNELS.sessionRemoveMcpServer, sessionId, serverName),
      toggleMcpServer: (sessionId, serverName, enabled) =>
        invokeTyped<void>(
          invoke,
          IPC_CHANNELS.sessionToggleMcpServer,
          sessionId,
          serverName,
          enabled,
        ),
      authenticateMcpServer: (sessionId, serverName) =>
        invokeTyped<void>(invoke, IPC_CHANNELS.sessionAuthenticateMcpServer, sessionId, serverName),
      cancelMcpAuth: (sessionId, serverName) =>
        invokeTyped<void>(invoke, IPC_CHANNELS.sessionCancelMcpAuth, sessionId, serverName),
      clearMcpAuth: (sessionId, serverName) =>
        invokeTyped<void>(invoke, IPC_CHANNELS.sessionClearMcpAuth, sessionId, serverName),
      submitMcpAuthCode: (sessionId, request) =>
        invokeTyped<void>(invoke, IPC_CHANNELS.sessionSubmitMcpAuthCode, sessionId, request),
      toggleMcpTool: (sessionId, serverName, toolName, enabled) =>
        invokeTyped<void>(
          invoke,
          IPC_CHANNELS.sessionToggleMcpTool,
          sessionId,
          serverName,
          toolName,
          enabled,
        ),
      killWorkerSession: (sessionId, workerSessionId) =>
        invokeTyped<void>(
          invoke,
          IPC_CHANNELS.sessionKillWorkerSession,
          sessionId,
          workerSessionId,
        ),
      submitBugReport: (sessionId, request) =>
        invokeTyped(invoke, IPC_CHANNELS.sessionSubmitBugReport, sessionId, request),
      getContextStats: (sessionId) =>
        invokeTyped<LiveSessionContextStatsInfo | null>(
          invoke,
          IPC_CHANNELS.sessionGetContextStats,
          sessionId,
        ),
      updateSettings: (sessionId, settings) =>
        invokeTyped<void>(invoke, IPC_CHANNELS.sessionUpdateSettings, sessionId, settings),
      interrupt: (sessionId) => invokeTyped<void>(invoke, IPC_CHANNELS.sessionInterrupt, sessionId),
      fork: (sessionId) =>
        invokeTyped<LiveSessionSnapshot>(invoke, IPC_CHANNELS.sessionFork, sessionId),
      forkViaDaemon: (sessionId) =>
        invokeTyped<LiveSessionSnapshot>(invoke, IPC_CHANNELS.sessionForkViaDaemon, sessionId),
      renameViaDaemon: (sessionId, title) =>
        invokeTyped<void>(invoke, IPC_CHANNELS.sessionRenameViaDaemon, sessionId, title),
      getRewindInfo: (sessionId, messageId) =>
        invokeTyped<LiveSessionRewindInfo>(
          invoke,
          IPC_CHANNELS.sessionGetRewindInfo,
          sessionId,
          messageId,
        ),
      executeRewind: (sessionId, params) =>
        invokeTyped<LiveSessionExecuteRewindResult>(
          invoke,
          IPC_CHANNELS.sessionExecuteRewind,
          sessionId,
          params,
        ),
      compact: (sessionId, customInstructions) =>
        invokeTyped<LiveSessionCompactResult>(
          invoke,
          IPC_CHANNELS.sessionCompact,
          sessionId,
          customInstructions,
        ),
      resolvePermissionRequest: (sessionId, requestId, selectedOption) =>
        invokeTyped<void>(
          invoke,
          IPC_CHANNELS.sessionResolvePermissionRequest,
          sessionId,
          requestId,
          selectedOption,
        ),
      resolveAskUser: (sessionId, requestId, answers) =>
        invokeTyped<void>(
          invoke,
          IPC_CHANNELS.sessionResolveAskUserRequest,
          sessionId,
          requestId,
          answers,
        ),
      onSnapshotChanged: (listener) =>
        subscribeTyped<LiveSessionSnapshotChangedPayload>(
          on,
          off,
          IPC_CHANNELS.sessionSnapshotChanged,
          listener,
        ),
      onEventBatch: (listener) =>
        subscribeTyped<LiveSessionEventBatchPayload>(
          on,
          off,
          IPC_CHANNELS.sessionEventBatch,
          listener,
        ),
    },
  }
}
