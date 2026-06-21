import type {
  Computer as DroidSdkComputer,
  ComputerListResponse as DroidSdkComputerListResponse,
  ComputerMetricsResponse as DroidSdkComputerMetricsResponse,
  CreateComputerOptions as DroidSdkCreateComputerOptions,
  DeleteComputerOptions as DroidSdkDeleteComputerOptions,
  GetComputerByNameOptions as DroidSdkGetComputerByNameOptions,
  GetComputerMetricsOptions as DroidSdkGetComputerMetricsOptions,
  GetComputerOptions as DroidSdkGetComputerOptions,
  GetMachineTemplateOptions as DroidSdkGetMachineTemplateOptions,
  InitializeSessionRequestParams as DroidSdkInitializeSessionRequestParams,
  ListComputersOptions as DroidSdkListComputersOptions,
  ListMachineTemplatesOptions as DroidSdkListMachineTemplatesOptions,
  ListRemoteSessionsOptions as DroidSdkListRemoteSessionsOptions,
  MachineTemplate as DroidSdkMachineTemplate,
  MachineTemplateListResponse as DroidSdkMachineTemplateListResponse,
  RefreshComputerOptions as DroidSdkRefreshComputerOptions,
  RefreshComputerResponse as DroidSdkRefreshComputerResponse,
  RemoteSessionListResponse as DroidSdkRemoteSessionListResponse,
  RestartComputerOptions as DroidSdkRestartComputerOptions,
  RetryInstallDepsOptions as DroidSdkRetryInstallDepsOptions,
  SessionSource as DroidSdkSessionSource,
  SessionTag as DroidSdkSessionTag,
  UpdateComputerOptions as DroidSdkUpdateComputerOptions,
  UpdateSessionSettingsRequestParams as DroidSdkUpdateSessionSettingsRequestParams,
} from '@factory/droid-sdk'
import type {
  PluginCapabilityInvokeResult,
  PluginCapabilityRecord,
  PluginHostSnapshot,
} from '../plugins/contracts'

export const IPC_CHANNELS = {
  runtimeInfo: 'app:runtime-info',
  appNotificationNavigation: 'app:notification-navigation',
  appGetUpdateState: 'app:get-update-state',
  appCheckForUpdates: 'app:check-for-updates',
  appInstallUpdate: 'app:install-update',
  appUpdateStateChanged: 'app:update-state-changed',
  appOpenWindow: 'app:open-window',
  diagnosticsLogTranscriptPerformance: 'diagnostics:log-transcript-performance',
  pluginCapabilitiesChanged: 'plugin:capabilities-changed',
  pluginListCapabilities: 'plugin:list-capabilities',
  pluginListHosts: 'plugin:list-hosts',
  pluginInvokeCapability: 'plugin:invoke-capability',
  pluginHostChanged: 'plugin:host-changed',
  foundationBootstrap: 'foundation:get-bootstrap',
  foundationChanged: 'foundation:changed',
  dialogSelectDirectory: 'dialog:select-directory',
  databaseListProjects: 'database:list-projects',
  databaseListSessions: 'database:list-sessions',
  databaseListSyncMetadata: 'database:list-sync-metadata',
  workspaceFilesList: 'workspace-files:list',
  workspaceFilesSearch: 'workspace-files:search',
  workspaceFilesGetContent: 'workspace-files:get-content',
  gitGetDiff: 'git:get-diff',
  gitCommit: 'git:commit',
  gitPush: 'git:push',
  gitCreatePullRequest: 'git:create-pull-request',
  factoryApiListMachineTemplates: 'factory-api:list-machine-templates',
  factoryApiGetMachineTemplate: 'factory-api:get-machine-template',
  factoryApiListComputers: 'factory-api:list-computers',
  factoryApiGetComputer: 'factory-api:get-computer',
  factoryApiCreateComputer: 'factory-api:create-computer',
  factoryApiGetComputerByName: 'factory-api:get-computer-by-name',
  factoryApiUpdateComputer: 'factory-api:update-computer',
  factoryApiDeleteComputer: 'factory-api:delete-computer',
  factoryApiRestartComputer: 'factory-api:restart-computer',
  factoryApiRefreshComputer: 'factory-api:refresh-computer',
  factoryApiGetComputerMetrics: 'factory-api:get-computer-metrics',
  factoryApiRetryInstallDeps: 'factory-api:retry-install-deps',
  factoryApiListRemoteSessions: 'factory-api:list-remote-sessions',
  sessionSearch: 'session:search',
  sessionSearchIndexingProgress: 'session:search-indexing-progress',
  transcriptGetSessionTranscript: 'transcript:get-session-transcript',
  transcriptGetScrollState: 'transcript:get-scroll-state',
  transcriptSetScrollState: 'transcript:set-scroll-state',
  sessionCreate: 'session:create',
  sessionGetSnapshot: 'session:get-snapshot',
  sessionAttach: 'session:attach',
  sessionDetach: 'session:detach',
  sessionAddUserMessage: 'session:add-user-message',
  sessionRename: 'session:rename',
  sessionDelete: 'session:delete',
  sessionListTools: 'session:list-tools',
  sessionListSkills: 'session:list-skills',
  sessionListMcpServers: 'session:list-mcp-servers',
  sessionListMcpTools: 'session:list-mcp-tools',
  sessionListMcpRegistry: 'session:list-mcp-registry',
  sessionAddMcpServer: 'session:add-mcp-server',
  sessionRemoveMcpServer: 'session:remove-mcp-server',
  sessionToggleMcpServer: 'session:toggle-mcp-server',
  sessionAuthenticateMcpServer: 'session:authenticate-mcp-server',
  sessionCancelMcpAuth: 'session:cancel-mcp-auth',
  sessionClearMcpAuth: 'session:clear-mcp-auth',
  sessionSubmitMcpAuthCode: 'session:submit-mcp-auth-code',
  sessionToggleMcpTool: 'session:toggle-mcp-tool',
  sessionKillWorkerSession: 'session:kill-worker-session',
  sessionSubmitBugReport: 'session:submit-bug-report',
  sessionGetContextStats: 'session:get-context-stats',
  sessionUpdateSettings: 'session:update-settings',
  sessionInterrupt: 'session:interrupt',
  sessionFork: 'session:fork',
  sessionForkViaDaemon: 'session:fork-via-daemon',
  sessionRenameViaDaemon: 'session:rename-via-daemon',
  sessionGetRewindInfo: 'session:get-rewind-info',
  sessionExecuteRewind: 'session:execute-rewind',
  sessionCompact: 'session:compact',
  sessionSnapshotChanged: 'session:snapshot-changed',
  sessionEventBatch: 'session:event-batch',
  sessionResolvePermissionRequest: 'session:resolve-permission-request',
  sessionResolveAskUserRequest: 'session:resolve-ask-user-request',
} as const

export type AppUpdatePhase =
  | 'idle'
  | 'checking'
  | 'downloading'
  | 'downloaded'
  | 'not-available'
  | 'error'
  | 'unsupported'

export interface AppUpdateState {
  phase: AppUpdatePhase
  currentVersion: string
  availableVersion: string | null
  downloadedVersion: string | null
  progressPercent: number | null
  message: string | null
  canInstall: boolean
}

export type RuntimePlatform = 'darwin' | 'linux' | 'win32'

export interface RuntimeInfo {
  appVersion: string
  chromeVersion: string
  electronVersion: string
  nodeVersion: string
  platform: RuntimePlatform
  isDarkModeForced: boolean
  hasRequire: boolean
  hasProcess: boolean
}

export interface ProjectRecord {
  id: string
  workspacePath: string
  displayName: string | null
  createdAt: string
  updatedAt: string
}

export interface SessionRecord {
  id: string
  projectId: string | null
  projectWorkspacePath: string | null
  projectDisplayName: string | null
  modelId?: string | null
  parentSessionId: string | null
  derivationType: string | null
  hasUserMessage?: boolean
  owner?: string | null
  messageCount?: number
  isFavorite?: boolean
  decompSessionType?: string | null
  decompMissionId?: string | null
  title: string
  status: string
  transport: string | null
  transportLocation?: 'local' | 'remote' | null
  createdAt: string
  lastActivityAt: string | null
  updatedAt: string
}

export interface SyncMetadataRecord {
  sourcePath: string
  sessionId: string
  lastByteOffset: number
  lastMtimeMs: number
  lastSyncedAt: string
  checksum: string | null
}

export interface WorkspaceFilesListRequest {
  sessionId: string
  showHidden?: boolean
}

export interface WorkspaceFilesListResponse {
  files: string[]
}

export interface WorkspaceFilesSearchRequest {
  sessionId: string
  query: string
  maxResults?: number
  showHidden?: boolean
}

export interface WorkspaceFilesSearchResponse {
  files: string[]
  totalFiles?: number
}

export type WorkspaceFileContentEncoding = 'utf8' | 'base64'

export interface WorkspaceFileContentRequest {
  sessionId: string
  filePath: string
  encoding?: WorkspaceFileContentEncoding
}

export interface WorkspaceFileContentResponse {
  content: string
  byteLength: number
  encoding: WorkspaceFileContentEncoding
  mimeType: string | null
  isBinary: boolean
}

export interface GitDiffRequest {
  sessionId: string
  baseBranch?: string
  statsOnly?: boolean
}

export interface GitDiffFile {
  path: string
  additions: number
  deletions: number
  status: string
}

export interface GitDiffCommit {
  hash: string
  message: string
}

export type GitDiffUnavailableReason =
  | 'missing_session_cwd'
  | 'not_git_repository'
  | 'git_not_available'
  | 'unknown'

export interface GitDiffData {
  diff: string
  branch: string
  baseBranch: string
  files: GitDiffFile[]
  totalAdditions: number
  totalDeletions: number
  remoteUrl: string | null
  commits: GitDiffCommit[]
  committedDiff: string
  committedFiles: GitDiffFile[]
  committedTotalAdditions: number
  committedTotalDeletions: number
  unstagedDiff: string
  unstagedFiles: GitDiffFile[]
  unstagedTotalAdditions: number
  unstagedTotalDeletions: number
  canCommit?: boolean
  canPush?: boolean
  canCreatePullRequest?: boolean
  commitUnavailableMessage?: string | null
  pushUnavailableMessage?: string | null
  createPullRequestUnavailableMessage?: string | null
}

export type GitDiffResponse =
  | {
      success: true
      data: GitDiffData
    }
  | {
      success: false
      unavailableReason: GitDiffUnavailableReason
      unavailableMessage: string
    }

export interface GitCommitRequest {
  sessionId: string
  message: string
}

export interface GitActionResponse {
  success: boolean
}

export interface GitPushRequest {
  sessionId: string
}

export interface CreatePullRequestRequest {
  sessionId: string
  title: string
  body?: string
  baseBranch: string
  draft?: boolean
  linkedTicketIds?: string[]
  linkedTicketUrls?: string[]
  jiraIssueKeys?: string[]
  linearIssueIds?: string[]
}

export interface CreatePullRequestResponse {
  number: number
  title: string
  url: string
  state: string
  draft: boolean
}

type FactoryApiOptionsWithoutCredentials<TOptions extends { apiKey: string; baseUrl?: string }> =
  Omit<TOptions, 'apiKey' | 'baseUrl'>

export type FactoryApiListMachineTemplatesRequest =
  FactoryApiOptionsWithoutCredentials<DroidSdkListMachineTemplatesOptions>
export type FactoryApiListMachineTemplatesResponse = DroidSdkMachineTemplateListResponse
export type FactoryApiGetMachineTemplateRequest =
  FactoryApiOptionsWithoutCredentials<DroidSdkGetMachineTemplateOptions>
export type FactoryApiGetMachineTemplateResponse = DroidSdkMachineTemplate
export type FactoryApiListComputersRequest =
  FactoryApiOptionsWithoutCredentials<DroidSdkListComputersOptions>
export type FactoryApiListComputersResponse = DroidSdkComputerListResponse
export type FactoryApiGetComputerRequest =
  FactoryApiOptionsWithoutCredentials<DroidSdkGetComputerOptions>
export type FactoryApiGetComputerResponse = DroidSdkComputer
export type FactoryApiCreateComputerRequest =
  FactoryApiOptionsWithoutCredentials<DroidSdkCreateComputerOptions>
export type FactoryApiCreateComputerResponse = DroidSdkComputer
export type FactoryApiGetComputerByNameRequest =
  FactoryApiOptionsWithoutCredentials<DroidSdkGetComputerByNameOptions>
export type FactoryApiGetComputerByNameResponse = DroidSdkComputer
export type FactoryApiUpdateComputerRequest =
  FactoryApiOptionsWithoutCredentials<DroidSdkUpdateComputerOptions>
export type FactoryApiUpdateComputerResponse = DroidSdkComputer
export type FactoryApiDeleteComputerRequest =
  FactoryApiOptionsWithoutCredentials<DroidSdkDeleteComputerOptions>
export type FactoryApiRestartComputerRequest =
  FactoryApiOptionsWithoutCredentials<DroidSdkRestartComputerOptions>
export type FactoryApiRefreshComputerRequest =
  FactoryApiOptionsWithoutCredentials<DroidSdkRefreshComputerOptions>
export type FactoryApiRefreshComputerResponse = DroidSdkRefreshComputerResponse
export type FactoryApiGetComputerMetricsRequest =
  FactoryApiOptionsWithoutCredentials<DroidSdkGetComputerMetricsOptions>
export type FactoryApiGetComputerMetricsResponse = DroidSdkComputerMetricsResponse
export type FactoryApiRetryInstallDepsRequest =
  FactoryApiOptionsWithoutCredentials<DroidSdkRetryInstallDepsOptions>
export type FactoryApiRetryInstallDepsResponse = DroidSdkComputer
export type FactoryApiListRemoteSessionsRequest =
  FactoryApiOptionsWithoutCredentials<DroidSdkListRemoteSessionsOptions>
export type FactoryApiListRemoteSessionsResponse = DroidSdkRemoteSessionListResponse

export interface LiveSessionToolInfo {
  id: string
  llmId: string
  displayName: string
  description?: string
  category?: string
  defaultAllowed: boolean
  currentlyAllowed: boolean
}

export interface LiveSessionSkillInfo {
  name: string
  description?: string
  location: string
  filePath: string
  enabled?: boolean
  userInvocable?: boolean
  version?: string
}

export interface LiveSessionMcpServerInfo {
  name: string
  status: string
  source: string
  isManaged: boolean
  error?: string
  toolCount?: number
  serverType?: string
  hasAuthTokens?: boolean
}

export interface LiveSessionMcpStatusSummary {
  total: number
  connected: number
  connecting: number
  failed: number
  disabled?: number
}

export interface LiveSessionMcpToolInfo {
  serverName: string
  name: string
  description?: string
  isEnabled: boolean
  isReadOnly?: boolean
  inputSchema?: {
    type?: string
    properties?: Record<string, unknown>
    required?: string[]
  }
}

export interface LiveSessionMcpRegistryServerInfo {
  name: string
  description: string
  type: string
  command?: string
  args?: string[]
  url?: string
  note?: string
  logoUrl?: string
}

export interface LiveSessionMcpServerConfig {
  name: string
  type: string
  url?: string
  headers?: Record<string, string>
  command?: string
  args?: string[]
  env?: Record<string, string>
}

export interface LiveSessionMcpAuthCodeRequest {
  serverName: string
  code: string
  state: string
}

export interface LiveSessionMessageImageSource {
  type: 'base64'
  data: string
  mediaType: 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp'
}

export interface LiveSessionMessageDocumentSource {
  type: string
  mediaType: string
  data: string
  name?: string
  mime?: string
}

export interface LiveSessionMessageOutputFormat {
  type: 'json_schema'
  schema: Record<string, unknown>
}

export interface LiveSessionAddUserMessageRequest {
  text: string
  images?: LiveSessionMessageImageSource[]
  files?: LiveSessionMessageDocumentSource[]
  outputFormat?: LiveSessionMessageOutputFormat
  queuePlacement?: 'end_of_turn' | 'end_of_loop'
}

export interface LiveSessionBugReportRequest {
  userComment: string
  clientLogs?: string
}

export interface LiveSessionBugReportResult {
  bugReportId: string
}

export interface LiveSessionContextStatsInfo {
  used: number
  remaining: number
  limit: number
  accuracy: 'exact' | 'estimated'
  updatedAt: string
}

export type TranscriptMessageRole = 'assistant' | 'system' | 'user'
export type TranscriptToolCallStatus = 'completed' | 'failed' | 'running'

export type TranscriptMessageContentBlock =
  | {
      type: 'text'
      text: string
    }
  | {
      type: 'image'
      mediaType: string
      data: string
    }
  | {
      type: 'thinking'
      thinking: string
      signature?: string
      signatureProvider?: string
      durationMs?: number
    }

export interface TranscriptMessageEntry {
  kind: 'message'
  id: string
  sourceMessageId?: string
  rewindBoundaryMessageId?: string
  occurredAt: string | null
  role: TranscriptMessageRole
  markdown: string
  contentBlocks?: TranscriptMessageContentBlock[]
}

export interface TranscriptToolCallEntry {
  kind: 'tool_call'
  id: string
  toolUseId: string
  occurredAt: string | null
  toolName: string
  status: TranscriptToolCallStatus
  inputMarkdown: string
  resultMarkdown: string | null
  resultIsError: boolean
}

export type TranscriptEntry = TranscriptMessageEntry | TranscriptToolCallEntry

export interface SessionTranscript {
  sessionId: string
  sourcePath: string
  loadedAt: string
  entries: TranscriptEntry[]
}

export interface SessionTranscriptScrollState {
  sessionId: string
  scrollTop: number
  scrollHeight: number
  clientHeight: number
  distanceFromBottom: number
  isAtBottom: boolean
  updatedAt: string
}

export interface SessionSearchRequest {
  query: string
  limit?: number
}

export interface SessionSearchReason {
  field:
    | 'title'
    | 'content'
    | 'project'
    | 'path'
    | 'status'
    | 'id'
    | 'tool'
    | 'source'
    | 'kind'
    | 'file'
    | 'command'
    | 'issue'
    | 'error'
    | 'model'
    | 'reasoning'
    | 'transport'
    | 'favorite'
    | 'extension'
  snippet: string
  sourceKind?:
    | 'session'
    | 'block'
    | 'tool_call'
    | 'tool_result'
    | 'file_snapshot'
    | 'compaction'
    | 'settings'
    | 'todo'
  sourceId?: string
  messageId?: string | null
  toolCallId?: string | null
}

export interface SessionSearchTarget {
  sessionId: string
  sourceKind: NonNullable<SessionSearchReason['sourceKind']>
  sourceId: string
  messageId?: string | null
  toolCallId?: string | null
}

export interface SessionSearchMatch {
  sessionId: string
  score: number
  reasons: SessionSearchReason[]
}

export interface SessionSearchResponse {
  query: string
  matches: SessionSearchMatch[]
}

export interface SessionSearchIndexingProgress {
  indexedSessions: number
  totalSessions: number
  isIndexing: boolean
  updatedAt: string
}

export interface DatabaseDiagnostics {
  path: string
  exists: boolean
  journalMode: string
  tableNames: string[]
}

export type DaemonConnectionStatus = 'connected' | 'disconnected' | 'reconnecting'

export interface DaemonConnectionTargetSnapshot {
  type: 'local' | 'url' | 'computer'
  label: string
  computerId?: string
}

export interface DaemonConnectionSnapshot {
  status: DaemonConnectionStatus
  connectedPort: number | null
  target?: DaemonConnectionTargetSnapshot
  lastError: string | null
  lastConnectedAt: string | null
  lastSyncAt: string | null
  nextRetryDelayMs: number | null
}

export interface DroidCliStatus {
  available: boolean
  path: string | null
  version: string | null
  searchedLocations: string[]
  error: string | null
}

export interface FoundationBootstrap {
  database: DatabaseDiagnostics
  droidCli: DroidCliStatus
  daemon: DaemonConnectionSnapshot
  projects: ProjectRecord[]
  sessions: SessionRecord[]
  syncMetadata: SyncMetadataRecord[]
  factoryModels: LiveSessionModel[]
  factoryDefaultSettings: {
    model?: string
    interactionMode?: string
    reasoningEffort?: string
    autonomyMode?: string
    autonomyLevel?: string
    specModeModelId?: string
    specModeReasoningEffort?: string
    enabledToolIds?: string[]
    disabledToolIds?: string[]
    compactionTokenLimit?: number
    compactionTokenLimitPerModel?: Record<string, number>
    compactionModel?: unknown
    compactionThresholdCheckEnabled?: boolean
    runInWorktree?: boolean
    worktreeDirectory?: string
    subagentModelSettings?: unknown
    missionSettings?: unknown
    missionModelSettings?: unknown
    missionOrchestratorModel?: string
    missionOrchestratorReasoningEffort?: string
  }
}

export interface FoundationRecordDelta<TRecord> {
  upserted: TRecord[]
  removedIds: string[]
}

export interface FoundationSyncMetadataDelta {
  upserted: SyncMetadataRecord[]
  removedSourcePaths: string[]
}

export interface FoundationChanges {
  database?: DatabaseDiagnostics
  droidCli?: DroidCliStatus
  daemon?: DaemonConnectionSnapshot
  projects?: FoundationRecordDelta<ProjectRecord>
  sessions?: FoundationRecordDelta<SessionRecord>
  syncMetadata?: FoundationSyncMetadataDelta
  factoryModels?: LiveSessionModel[]
  factoryDefaultSettings?: FoundationBootstrap['factoryDefaultSettings']
}

export interface FoundationChangedPayload {
  refreshedAt: string
  changes?: FoundationChanges
}

export interface TranscriptPerformanceEvent {
  source: 'main' | 'renderer'
  name: string
  timestamp: string
  sessionId?: string
  durationMs?: number
  details?: Record<string, unknown>
}

export interface PluginHostChangedPayload {
  snapshot: PluginHostSnapshot
}

export interface PluginCapabilitiesChangedPayload {
  refreshedAt: string
}

export interface LiveSessionSnapshotChangedPayload {
  snapshot: LiveSessionSnapshot
}

export interface LiveSessionEventBatchPayload {
  sessionId: string
  sequenceStart: number
  sequenceEnd: number
  events: LiveSessionEventRecord[]
}

export interface LiveSessionTokenUsageRecord {
  inputTokens: number
  outputTokens: number
  cacheCreationTokens: number
  cacheReadTokens: number
  thinkingTokens: number
}

export interface LiveSessionLastCallTokenUsageRecord {
  inputTokens: number
  cacheReadTokens: number
}

export interface LiveSessionRewindFileRecord {
  filePath: string
  contentHash: string
  size: number
}

export interface LiveSessionCreatedFileRecord {
  filePath: string
}

export interface LiveSessionEvictedFileRecord {
  filePath: string
  reason: string
}

export interface LiveSessionRewindInfo {
  availableFiles: LiveSessionRewindFileRecord[]
  createdFiles: LiveSessionCreatedFileRecord[]
  evictedFiles: LiveSessionEvictedFileRecord[]
}

export interface LiveSessionExecuteRewindParams {
  messageId: string
  filesToRestore: LiveSessionRewindFileRecord[]
  filesToDelete: LiveSessionCreatedFileRecord[]
  forkTitle: string
}

export interface LiveSessionExecuteRewindResult {
  snapshot: LiveSessionSnapshot
  restoredCount: number
  deletedCount: number
  failedRestoreCount: number
  failedDeleteCount: number
}

export interface LiveSessionCompactResult {
  snapshot: LiveSessionSnapshot
  removedCount: number
}

export interface LiveSessionModel {
  id: string
  name: string
  provider?: string | null
  supportedReasoningEfforts?: string[]
  defaultReasoningEffort?: string
  maxContextLimit?: number | null
}

type DroidSdkSessionSettingsKey = keyof DroidSdkUpdateSessionSettingsRequestParams
type DroidSdkInitializeSessionSettingsKey = Exclude<
  keyof DroidSdkInitializeSessionRequestParams,
  'cwd' | 'machineId' | 'mcpOAuthCallbackUri' | 'sessionId' | 'workspaceId'
>

export type LiveSessionSettings = Partial<Record<DroidSdkSessionSettingsKey, unknown>> & {
  modelId?: string
  interactionMode?: string
  reasoningEffort?: string
  autonomyLevel?: string
  autonomyMode?: string
  specModeModelId?: string
  specModeReasoningEffort?: string
  enabledToolIds?: string[]
  disabledToolIds?: string[]
}

export type LiveSessionCreateSettings = Partial<
  Record<DroidSdkInitializeSessionSettingsKey, unknown>
> & {
  modelId?: string
  interactionMode?: string
  reasoningEffort?: string
  autonomyLevel?: string
  autonomyMode?: string
  specModeModelId?: string
  specModeReasoningEffort?: string
  enabledToolIds?: string[]
  disabledToolIds?: string[]
  sessionSource?: DroidSdkSessionSource
  tags?: DroidSdkSessionTag[]
}

export interface LiveSessionCreateRequest {
  cwd: string
  settings?: LiveSessionCreateSettings
}

export interface LiveSessionMessage {
  id: string
  role?: string
  content: string
  rewindBoundaryMessageId?: string
  contentBlocks?: TranscriptMessageContentBlock[]
}

interface BaseLiveSessionEventRecord {
  type: string
  sessionId?: string
  occurredAt?: string
}

export interface LiveSessionMessageDeltaEventRecord extends BaseLiveSessionEventRecord {
  type: 'message.delta'
  messageId: string
  delta: string
  channel?: string
  blockIndex?: number
}

export interface LiveSessionMessageCompletedEventRecord extends BaseLiveSessionEventRecord {
  type: 'message.completed'
  messageId: string
  content: string
  rewindBoundaryMessageId?: string
  contentBlocks?: TranscriptMessageContentBlock[]
  role?: string
}

export interface LiveSessionToolProgressEventRecord extends BaseLiveSessionEventRecord {
  type: 'tool.progress'
  toolUseId: string
  toolName: string
  status: string
  detail?: string
}

export interface LiveSessionToolResultEventRecord extends BaseLiveSessionEventRecord {
  type: 'tool.result'
  toolUseId: string
  toolName: string
  content?: unknown
  isError?: boolean
}

export interface LiveSessionPermissionOptionRecord {
  label: string
  value: string
}

export interface LiveSessionPermissionRequestedEventRecord extends BaseLiveSessionEventRecord {
  type: 'permission.requested'
  requestId: string
  options: readonly LiveSessionPermissionOptionRecord[]
  toolUseIds?: readonly string[]
  reason?: string
  riskLevel?: string
}

export interface LiveSessionPermissionResolvedEventRecord extends BaseLiveSessionEventRecord {
  type: 'permission.resolved'
  requestId: string
  toolUseIds: readonly string[]
  selectedOption: string
}

export interface LiveSessionAskUserQuestionRecord {
  index: number
  topic: string
  question: string
  options: readonly string[]
}

export interface LiveSessionAskUserAnswerRecord {
  index: number
  question: string
  answer: string
}

export interface LiveSessionAskUserRequestedEventRecord extends BaseLiveSessionEventRecord {
  type: 'askUser.requested'
  requestId: string
  toolCallId?: string
  prompt: string
  options: readonly string[]
  questions: readonly LiveSessionAskUserQuestionRecord[]
  defaultOption?: string
}

export interface LiveSessionAskUserResolvedEventRecord extends BaseLiveSessionEventRecord {
  type: 'askUser.resolved'
  requestId: string
  selectedOption: string
  answers: readonly LiveSessionAskUserAnswerRecord[]
}

export interface LiveSessionStatusChangedEventRecord extends BaseLiveSessionEventRecord {
  type: 'session.statusChanged'
  status: string
  previousStatus?: string
}

export interface LiveSessionSettingsChangedEventRecord extends BaseLiveSessionEventRecord {
  type: 'session.settingsChanged'
  settings: LiveSessionSettings
}

export interface LiveSessionTitleChangedEventRecord extends BaseLiveSessionEventRecord {
  type: 'session.titleChanged'
  title: string
  previousTitle?: string
}

export interface LiveSessionTokenUsageChangedEventRecord extends BaseLiveSessionEventRecord {
  type: 'session.tokenUsageChanged'
  tokenUsage: LiveSessionTokenUsageRecord
  lastCallTokenUsage?: LiveSessionLastCallTokenUsageRecord | null
  previousTokenUsage?: LiveSessionTokenUsageRecord
}

export interface LiveSessionStreamWarningEventRecord extends BaseLiveSessionEventRecord {
  type: 'stream.warning'
  warning: string
  kind?: string
}

export interface LiveSessionStreamErrorEventRecord extends BaseLiveSessionEventRecord {
  type: 'stream.error'
  error: string
  recoverable?: boolean
}

export interface LiveSessionStreamCompletedEventRecord extends BaseLiveSessionEventRecord {
  type: 'stream.completed'
  reason?: string
}

export interface LiveSessionResultEventRecord extends BaseLiveSessionEventRecord {
  type: 'session.result'
  success: boolean
  text: string
  durationMs: number
  turnCount: number
  structuredOutput?: unknown
  structuredOutputError?: unknown
  tokenUsage?: LiveSessionTokenUsageRecord | null
  error?: string | null
}

export interface LiveSessionHookExecutionEventRecord extends BaseLiveSessionEventRecord {
  type: 'hook.execution'
  hookId: string
  eventName?: string
  matcher?: string
  toolCallId?: string
  command?: string
  timeout?: number
  status: string
  exitCode?: number
  stdout?: string
  stderr?: string
}

export interface LiveSessionMcpStatusChangedEventRecord extends BaseLiveSessionEventRecord {
  type: 'mcp.statusChanged'
  servers: LiveSessionMcpServerInfo[]
  summary: LiveSessionMcpStatusSummary
}

export interface LiveSessionMcpAuthRequiredEventRecord extends BaseLiveSessionEventRecord {
  type: 'mcp.authRequired'
  serverName: string
  authUrl: string
  message: string
  state: string
}

export interface LiveSessionMcpAuthCompletedEventRecord extends BaseLiveSessionEventRecord {
  type: 'mcp.authCompleted'
  serverName: string
  outcome: string
  message: string
}

export interface LiveSessionMissionStateChangedEventRecord extends BaseLiveSessionEventRecord {
  type: 'mission.stateChanged'
  state: string
}

export interface LiveSessionMissionFeaturesChangedEventRecord extends BaseLiveSessionEventRecord {
  type: 'mission.featuresChanged'
  features: unknown[]
}

export interface LiveSessionMissionProgressEntryEventRecord extends BaseLiveSessionEventRecord {
  type: 'mission.progressEntry'
  progressLog: unknown[]
}

export interface LiveSessionMissionHeartbeatEventRecord extends BaseLiveSessionEventRecord {
  type: 'mission.heartbeat'
  timestamp: string
}

export interface LiveSessionMissionWorkerStartedEventRecord extends BaseLiveSessionEventRecord {
  type: 'mission.workerStarted'
  workerSessionId: string
}

export interface LiveSessionMissionWorkerCompletedEventRecord extends BaseLiveSessionEventRecord {
  type: 'mission.workerCompleted'
  workerSessionId: string
  exitCode: number
}

export type LiveSessionEventRecord =
  | LiveSessionMessageDeltaEventRecord
  | LiveSessionMessageCompletedEventRecord
  | LiveSessionToolProgressEventRecord
  | LiveSessionToolResultEventRecord
  | LiveSessionPermissionRequestedEventRecord
  | LiveSessionPermissionResolvedEventRecord
  | LiveSessionAskUserRequestedEventRecord
  | LiveSessionAskUserResolvedEventRecord
  | LiveSessionStatusChangedEventRecord
  | LiveSessionSettingsChangedEventRecord
  | LiveSessionTitleChangedEventRecord
  | LiveSessionTokenUsageChangedEventRecord
  | LiveSessionStreamWarningEventRecord
  | LiveSessionStreamErrorEventRecord
  | LiveSessionStreamCompletedEventRecord
  | LiveSessionResultEventRecord
  | LiveSessionHookExecutionEventRecord
  | LiveSessionMcpStatusChangedEventRecord
  | LiveSessionMcpAuthRequiredEventRecord
  | LiveSessionMcpAuthCompletedEventRecord
  | LiveSessionMissionStateChangedEventRecord
  | LiveSessionMissionFeaturesChangedEventRecord
  | LiveSessionMissionProgressEntryEventRecord
  | LiveSessionMissionHeartbeatEventRecord
  | LiveSessionMissionWorkerStartedEventRecord
  | LiveSessionMissionWorkerCompletedEventRecord

export interface LiveSessionSnapshot {
  sessionId: string
  title: string
  status: string
  transport: 'stream-jsonrpc' | 'daemon'
  processId: number | null
  viewerCount: number
  projectWorkspacePath: string | null
  parentSessionId: string | null
  availableModels: LiveSessionModel[]
  settings: LiveSessionSettings
  transcriptRevision?: number
  messages: LiveSessionMessage[]
  events: LiveSessionEventRecord[]
}

export interface NotificationNavigationPayload {
  sessionId: string
}

export interface AppUpdateStateChangedPayload {
  snapshot: AppUpdateState
}

export interface OxoxBridge {
  runtime: {
    getInfo: () => Promise<RuntimeInfo>
  }
  app?: {
    getUpdateState: () => Promise<AppUpdateState>
    checkForUpdates: () => Promise<AppUpdateState>
    installUpdate: () => Promise<void>
    onNotificationNavigation: (
      listener: (payload: NotificationNavigationPayload) => void,
    ) => (() => void) | undefined
    onUpdateStateChanged?: (
      listener: (payload: AppUpdateStateChangedPayload) => void,
    ) => (() => void) | undefined
    openNewWindow: () => Promise<void>
  }
  diagnostics?: {
    logTranscriptPerformance: (events: TranscriptPerformanceEvent[]) => Promise<void>
  }
  plugin?: {
    listCapabilities: () => Promise<PluginCapabilityRecord[]>
    listHosts: () => Promise<PluginHostSnapshot[]>
    invokeCapability: (
      capabilityId: string,
      payload?: unknown,
    ) => Promise<PluginCapabilityInvokeResult>
    onCapabilitiesChanged?: (
      listener: (payload: PluginCapabilitiesChangedPayload) => void,
    ) => (() => void) | undefined
    onHostChanged?: (
      listener: (payload: PluginHostChangedPayload) => void,
    ) => (() => void) | undefined
  }
  dialog: {
    selectDirectory: () => Promise<string | null>
    getPathForFile?: (file: File) => string | null
  }
  foundation: {
    getBootstrap: () => Promise<FoundationBootstrap>
    onChanged?: (listener: (payload: FoundationChangedPayload) => void) => (() => void) | undefined
  }
  database: {
    listProjects: () => Promise<ProjectRecord[]>
    listSessions: () => Promise<SessionRecord[]>
    listSyncMetadata: () => Promise<SyncMetadataRecord[]>
  }
  workspaceFiles: {
    list: (request: WorkspaceFilesListRequest) => Promise<WorkspaceFilesListResponse>
    search: (request: WorkspaceFilesSearchRequest) => Promise<WorkspaceFilesSearchResponse>
    getContent: (request: WorkspaceFileContentRequest) => Promise<WorkspaceFileContentResponse>
  }
  git: {
    getDiff: (request: GitDiffRequest) => Promise<GitDiffResponse>
    commit: (request: GitCommitRequest) => Promise<GitActionResponse>
    push: (request: GitPushRequest) => Promise<GitActionResponse>
    createPullRequest: (request: CreatePullRequestRequest) => Promise<CreatePullRequestResponse>
  }
  factoryApi: {
    listMachineTemplates: (
      request?: FactoryApiListMachineTemplatesRequest,
    ) => Promise<FactoryApiListMachineTemplatesResponse>
    getMachineTemplate: (
      request: FactoryApiGetMachineTemplateRequest,
    ) => Promise<FactoryApiGetMachineTemplateResponse>
    listComputers: (
      request?: FactoryApiListComputersRequest,
    ) => Promise<FactoryApiListComputersResponse>
    getComputer: (request: FactoryApiGetComputerRequest) => Promise<FactoryApiGetComputerResponse>
    createComputer: (
      request: FactoryApiCreateComputerRequest,
    ) => Promise<FactoryApiCreateComputerResponse>
    getComputerByName: (
      request: FactoryApiGetComputerByNameRequest,
    ) => Promise<FactoryApiGetComputerByNameResponse>
    updateComputer: (
      request: FactoryApiUpdateComputerRequest,
    ) => Promise<FactoryApiUpdateComputerResponse>
    deleteComputer: (request: FactoryApiDeleteComputerRequest) => Promise<void>
    restartComputer: (request: FactoryApiRestartComputerRequest) => Promise<void>
    refreshComputer: (
      request: FactoryApiRefreshComputerRequest,
    ) => Promise<FactoryApiRefreshComputerResponse>
    getComputerMetrics: (
      request: FactoryApiGetComputerMetricsRequest,
    ) => Promise<FactoryApiGetComputerMetricsResponse>
    retryInstallDeps: (
      request: FactoryApiRetryInstallDepsRequest,
    ) => Promise<FactoryApiRetryInstallDepsResponse>
    listRemoteSessions: (
      request?: FactoryApiListRemoteSessionsRequest,
    ) => Promise<FactoryApiListRemoteSessionsResponse>
  }
  transcript: {
    getSessionTranscript: (sessionId: string) => Promise<SessionTranscript>
    getScrollState: (sessionId: string) => Promise<SessionTranscriptScrollState | null>
    setScrollState: (state: SessionTranscriptScrollState) => Promise<void>
  }
  search: {
    sessions: (request: SessionSearchRequest) => Promise<SessionSearchResponse>
    indexingProgress: () => Promise<SessionSearchIndexingProgress>
  }
  session: {
    create: (request: LiveSessionCreateRequest) => Promise<LiveSessionSnapshot>
    getSnapshot: (sessionId: string) => Promise<LiveSessionSnapshot | null>
    attach: (sessionId: string) => Promise<LiveSessionSnapshot>
    detach: (sessionId: string) => Promise<LiveSessionSnapshot>
    addUserMessage: (
      sessionId: string,
      message: string | LiveSessionAddUserMessageRequest,
    ) => Promise<void>
    rename: (sessionId: string, title: string) => Promise<void>
    listTools: (sessionId: string) => Promise<LiveSessionToolInfo[]>
    listSkills: (sessionId: string) => Promise<LiveSessionSkillInfo[]>
    listMcpServers: (sessionId: string) => Promise<LiveSessionMcpServerInfo[]>
    listMcpTools: (sessionId: string) => Promise<LiveSessionMcpToolInfo[]>
    listMcpRegistry: (sessionId: string) => Promise<LiveSessionMcpRegistryServerInfo[]>
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
    getContextStats: (sessionId: string) => Promise<LiveSessionContextStatsInfo | null>
    updateSettings: (sessionId: string, settings: Partial<LiveSessionSettings>) => Promise<void>
    interrupt: (sessionId: string) => Promise<void>
    deleteSession: (sessionId: string) => Promise<void>
    fork: (sessionId: string, title?: string) => Promise<LiveSessionSnapshot>
    forkViaDaemon: (sessionId: string, title?: string) => Promise<LiveSessionSnapshot>
    renameViaDaemon: (sessionId: string, title: string) => Promise<void>
    getRewindInfo: (sessionId: string, messageId: string) => Promise<LiveSessionRewindInfo>
    executeRewind: (
      sessionId: string,
      params: LiveSessionExecuteRewindParams,
    ) => Promise<LiveSessionExecuteRewindResult>
    compact: (sessionId: string, customInstructions?: string) => Promise<LiveSessionCompactResult>
    resolvePermissionRequest: (
      sessionId: string,
      requestId: string,
      selectedOption: string,
    ) => Promise<void>
    resolveAskUser: (
      sessionId: string,
      requestId: string,
      answers: LiveSessionAskUserAnswerRecord[],
    ) => Promise<void>
    onSnapshotChanged?: (
      listener: (payload: LiveSessionSnapshotChangedPayload) => void,
    ) => (() => void) | undefined
    onEventBatch?: (
      listener: (payload: LiveSessionEventBatchPayload) => void,
    ) => (() => void) | undefined
  }
}
