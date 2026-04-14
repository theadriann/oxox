import type {
  PluginCapabilityInvokeResult,
  PluginCapabilityRecord,
  PluginHostSnapshot,
} from '../plugins/contracts'

export const IPC_CHANNELS = {
  runtimeInfo: 'app:runtime-info',
  appNotificationNavigation: 'app:notification-navigation',
  appOpenWindow: 'app:open-window',
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
  transcriptGetSessionTranscript: 'transcript:get-session-transcript',
  sessionCreate: 'session:create',
  sessionGetSnapshot: 'session:get-snapshot',
  sessionAttach: 'session:attach',
  sessionDetach: 'session:detach',
  sessionAddUserMessage: 'session:add-user-message',
  sessionUpdateSettings: 'session:update-settings',
  sessionInterrupt: 'session:interrupt',
  sessionFork: 'session:fork',
  sessionForkViaDaemon: 'session:fork-via-daemon',
  sessionRenameViaDaemon: 'session:rename-via-daemon',
  sessionGetRewindInfo: 'session:get-rewind-info',
  sessionExecuteRewind: 'session:execute-rewind',
  sessionCompact: 'session:compact',
  sessionSnapshotChanged: 'session:snapshot-changed',
  sessionResolvePermissionRequest: 'session:resolve-permission-request',
  sessionResolveAskUserRequest: 'session:resolve-ask-user-request',
} as const

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
  title: string
  status: string
  transport: string | null
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

export interface TranscriptMessageEntry {
  kind: 'message'
  id: string
  sourceMessageId?: string
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

export interface DatabaseDiagnostics {
  path: string
  exists: boolean
  journalMode: string
  tableNames: string[]
}

export type DaemonConnectionStatus = 'connected' | 'disconnected' | 'reconnecting'

export interface DaemonConnectionSnapshot {
  status: DaemonConnectionStatus
  connectedPort: number | null
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
    compactionTokenLimit?: number
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

export interface PluginHostChangedPayload {
  snapshot: PluginHostSnapshot
}

export interface PluginCapabilitiesChangedPayload {
  refreshedAt: string
}

export interface LiveSessionSnapshotChangedPayload {
  snapshot: LiveSessionSnapshot
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

export interface LiveSessionSettings {
  modelId?: string
  interactionMode?: string
  reasoningEffort?: string
  autonomyLevel?: string
}

export interface LiveSessionMessage {
  id: string
  role?: string
  content: string
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

export interface LiveSessionPermissionRequestedEventRecord extends BaseLiveSessionEventRecord {
  type: 'permission.requested'
  requestId: string
  options: readonly string[]
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

export interface LiveSessionSnapshot {
  sessionId: string
  title: string
  status: string
  transport: 'stream-jsonrpc'
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

export interface OxoxBridge {
  runtime: {
    getInfo: () => Promise<RuntimeInfo>
  }
  app?: {
    onNotificationNavigation: (
      listener: (payload: NotificationNavigationPayload) => void,
    ) => (() => void) | undefined
    openNewWindow: () => Promise<void>
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
  transcript: {
    getSessionTranscript: (sessionId: string) => Promise<SessionTranscript>
  }
  session: {
    create: (cwd: string) => Promise<LiveSessionSnapshot>
    getSnapshot: (sessionId: string) => Promise<LiveSessionSnapshot | null>
    attach: (sessionId: string) => Promise<LiveSessionSnapshot>
    detach: (sessionId: string) => Promise<LiveSessionSnapshot>
    addUserMessage: (sessionId: string, text: string) => Promise<void>
    updateSettings: (sessionId: string, settings: Partial<LiveSessionSettings>) => Promise<void>
    interrupt: (sessionId: string) => Promise<void>
    fork: (sessionId: string) => Promise<LiveSessionSnapshot>
    forkViaDaemon: (sessionId: string) => Promise<LiveSessionSnapshot>
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
  }
}
