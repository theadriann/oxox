import type {
  LiveSessionAskUserAnswerRecord,
  LiveSessionAskUserQuestionRecord,
  LiveSessionMcpServerInfo,
  LiveSessionMcpStatusSummary,
  LiveSessionTokenUsageRecord,
  TranscriptMessageContentBlock,
} from '../../../shared/ipc/contracts'

export type SessionEventRole = 'assistant' | 'user' | 'system' | (string & {})
export type MessageChannel = 'assistant' | 'thinking' | 'system' | (string & {})
export type PermissionOption = string
export type SessionStatus = string
export type StreamCompletionReason =
  | 'completed'
  | 'cancelled'
  | 'interrupted'
  | 'disposed'
  | (string & {})

export interface TokenUsageSnapshot {
  readonly inputTokens: number
  readonly outputTokens: number
  readonly cacheCreationTokens: number
  readonly cacheReadTokens: number
  readonly thinkingTokens: number
}

export interface LastCallTokenUsageSnapshot {
  readonly inputTokens: number
  readonly cacheReadTokens: number
}

interface BaseSessionEvent {
  readonly type: string
  readonly sessionId?: string
  readonly occurredAt?: string
}

export interface MessageDeltaEvent extends BaseSessionEvent {
  readonly type: 'message.delta'
  readonly messageId: string
  readonly delta: string
  readonly channel?: MessageChannel
  readonly blockIndex?: number
}

export interface MessageCompletedEvent extends BaseSessionEvent {
  readonly type: 'message.completed'
  readonly messageId: string
  readonly content: string
  readonly rewindBoundaryMessageId?: string
  readonly contentBlocks?: readonly TranscriptMessageContentBlock[]
  readonly role?: SessionEventRole
}

export interface ToolProgressEvent extends BaseSessionEvent {
  readonly type: 'tool.progress'
  readonly toolUseId: string
  readonly toolName: string
  readonly status: string
  readonly detail?: string
}

export interface ToolResultEvent extends BaseSessionEvent {
  readonly type: 'tool.result'
  readonly toolUseId: string
  readonly toolName: string
  readonly content?: unknown
  readonly isError?: boolean
}

export interface PermissionRequestedEvent extends BaseSessionEvent {
  readonly type: 'permission.requested'
  readonly requestId: string
  readonly options: readonly PermissionOption[]
  readonly toolUseIds?: readonly string[]
  readonly reason?: string
  readonly riskLevel?: string
}

export interface PermissionResolvedEvent extends BaseSessionEvent {
  readonly type: 'permission.resolved'
  readonly requestId: string
  readonly toolUseIds: readonly string[]
  readonly selectedOption: PermissionOption
}

export interface AskUserRequestedEvent extends BaseSessionEvent {
  readonly type: 'askUser.requested'
  readonly requestId: string
  readonly toolCallId?: string
  readonly prompt: string
  readonly options: readonly string[]
  readonly questions: readonly LiveSessionAskUserQuestionRecord[]
  readonly defaultOption?: string
}

export interface AskUserResolvedEvent extends BaseSessionEvent {
  readonly type: 'askUser.resolved'
  readonly requestId: string
  readonly selectedOption: string
  readonly answers: readonly LiveSessionAskUserAnswerRecord[]
}

export interface SessionStatusChangedEvent extends BaseSessionEvent {
  readonly type: 'session.statusChanged'
  readonly status: SessionStatus
  readonly previousStatus?: SessionStatus
}

export interface SessionSettingsPatch {
  readonly modelId?: string
  readonly interactionMode?: string
  readonly reasoningEffort?: string
  readonly autonomyLevel?: string
  readonly autonomyMode?: string
  readonly specModeModelId?: string
  readonly specModeReasoningEffort?: string
  readonly enabledToolIds?: readonly string[]
  readonly disabledToolIds?: readonly string[]
}

export interface SessionSettingsChangedEvent extends BaseSessionEvent {
  readonly type: 'session.settingsChanged'
  readonly settings: SessionSettingsPatch
}

export interface SessionTitleChangedEvent extends BaseSessionEvent {
  readonly type: 'session.titleChanged'
  readonly title: string
  readonly previousTitle?: string
}

export interface SessionTokenUsageChangedEvent extends BaseSessionEvent {
  readonly type: 'session.tokenUsageChanged'
  readonly tokenUsage: TokenUsageSnapshot
  readonly lastCallTokenUsage?: LastCallTokenUsageSnapshot | null
  readonly previousTokenUsage?: TokenUsageSnapshot
}

export interface StreamWarningEvent extends BaseSessionEvent {
  readonly type: 'stream.warning'
  readonly warning: string
  readonly kind?: string
}

export interface StreamErrorEvent extends BaseSessionEvent {
  readonly type: 'stream.error'
  readonly error: Error
  readonly recoverable?: boolean
}

export interface StreamCompletedEvent extends BaseSessionEvent {
  readonly type: 'stream.completed'
  readonly reason?: StreamCompletionReason
}

export interface SessionResultEvent extends BaseSessionEvent {
  readonly type: 'session.result'
  readonly success: boolean
  readonly text: string
  readonly durationMs: number
  readonly turnCount: number
  readonly structuredOutput?: unknown
  readonly structuredOutputError?: unknown
  readonly tokenUsage?: LiveSessionTokenUsageRecord | null
  readonly error?: string | null
}

export interface McpStatusChangedEvent extends BaseSessionEvent {
  readonly type: 'mcp.statusChanged'
  readonly servers: readonly LiveSessionMcpServerInfo[]
  readonly summary: LiveSessionMcpStatusSummary
}

export interface McpAuthRequiredEvent extends BaseSessionEvent {
  readonly type: 'mcp.authRequired'
  readonly serverName: string
  readonly authUrl: string
  readonly message: string
  readonly state: string
}

export interface McpAuthCompletedEvent extends BaseSessionEvent {
  readonly type: 'mcp.authCompleted'
  readonly serverName: string
  readonly outcome: string
  readonly message: string
}

export interface MissionStateChangedEvent extends BaseSessionEvent {
  readonly type: 'mission.stateChanged'
  readonly state: string
}

export interface MissionFeaturesChangedEvent extends BaseSessionEvent {
  readonly type: 'mission.featuresChanged'
  readonly features: readonly unknown[]
}

export interface MissionProgressEntryEvent extends BaseSessionEvent {
  readonly type: 'mission.progressEntry'
  readonly progressLog: readonly unknown[]
}

export interface MissionHeartbeatEvent extends BaseSessionEvent {
  readonly type: 'mission.heartbeat'
  readonly timestamp: string
}

export interface MissionWorkerStartedEvent extends BaseSessionEvent {
  readonly type: 'mission.workerStarted'
  readonly workerSessionId: string
}

export interface MissionWorkerCompletedEvent extends BaseSessionEvent {
  readonly type: 'mission.workerCompleted'
  readonly workerSessionId: string
  readonly exitCode: number
}

export type SessionEvent =
  | MessageDeltaEvent
  | MessageCompletedEvent
  | ToolProgressEvent
  | ToolResultEvent
  | PermissionRequestedEvent
  | PermissionResolvedEvent
  | AskUserRequestedEvent
  | AskUserResolvedEvent
  | SessionStatusChangedEvent
  | SessionSettingsChangedEvent
  | SessionTitleChangedEvent
  | SessionTokenUsageChangedEvent
  | StreamWarningEvent
  | StreamErrorEvent
  | StreamCompletedEvent
  | SessionResultEvent
  | McpStatusChangedEvent
  | McpAuthRequiredEvent
  | McpAuthCompletedEvent
  | MissionStateChangedEvent
  | MissionFeaturesChangedEvent
  | MissionProgressEntryEvent
  | MissionHeartbeatEvent
  | MissionWorkerStartedEvent
  | MissionWorkerCompletedEvent
