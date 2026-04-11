import type { Readable } from 'node:stream'
import type {
  LiveSessionAskUserAnswerRecord,
  LiveSessionCompactResult,
  LiveSessionExecuteRewindParams,
  LiveSessionExecuteRewindResult,
  LiveSessionRewindInfo,
  TranscriptMessageContentBlock,
} from '../../../shared/ipc/contracts'

import type { DatabaseService } from '../database/service'
import type { DroidSdkSessionFactory } from '../droidSdk/factory'
import type { SessionEvent } from '../protocol/sessionEvents'

export type ReadableLike = Readable | ReadableStream<Uint8Array>

export type RequestId = string

export type StreamJsonRpcMessage = {
  id: string
  role?: string
  content?: unknown
}

export type StreamJsonRpcSession = {
  messages: StreamJsonRpcMessage[]
  title?: string
  sessionTitle?: string
  name?: string
}

export type StreamJsonRpcModel = {
  id?: string
  name?: string
  provider?: string
}

export interface LiveSessionModel {
  id: string
  name: string
  provider?: string | null
}

export interface LiveSessionSettings {
  modelId?: string
  interactionMode?: string
  reasoningEffort?: string
  autonomyLevel?: string
}

export type StreamJsonRpcLoadResult = {
  session: StreamJsonRpcSession
  settings?: LiveSessionSettings
  availableModels?: StreamJsonRpcModel[]
  cwd?: string
  isAgentLoopInProgress?: boolean
}

export type StreamJsonRpcInitializeResult = StreamJsonRpcLoadResult & {
  sessionId: string
}

export interface SessionChildProcess {
  readonly pid: number
  readonly stdin: {
    write: (chunk: string | Uint8Array) => boolean | undefined
    end?: () => void
  }
  readonly stdout: ReadableLike
  readonly stderr?: ReadableLike
  readonly exitCode: number | null
  readonly killed: boolean
  readonly exited?: Promise<number | null>
  kill: (signal?: NodeJS.Signals | number) => boolean | undefined
  on?: (event: 'exit', listener: (code: number | null) => void) => void
  once?: (event: 'exit', listener: (code: number | null) => void) => void
}

export interface SpawnProcessRequest {
  command: string
  args: string[]
  cwd?: string
  env?: NodeJS.ProcessEnv
}

export interface LiveSessionMessage {
  id: string
  role?: SessionEventRole
  content: string
  contentBlocks?: TranscriptMessageContentBlock[]
}

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
  transcriptRevision: number
  messages: LiveSessionMessage[]
  events: SessionEvent[]
}

export interface LiveSessionNotificationPermission {
  requestId: string
  reason: string | null
}

export interface LiveSessionNotificationAskUser {
  requestId: string
  prompt: string | null
}

export interface LiveSessionNotificationSummary {
  sessionId: string
  title: string
  pendingPermissions: LiveSessionNotificationPermission[]
  pendingAskUser: LiveSessionNotificationAskUser[]
  completionCount: number
}

export interface CreateSessionRequest {
  cwd: string
  viewerId?: string
}

export interface AttachSessionRequest {
  viewerId?: string
}

export interface ForkSessionRequest {
  cwd?: string
  viewerId?: string
}

export interface CompactSessionRequest {
  customInstructions?: string
  viewerId?: string
}

export interface ExecuteRewindRequest extends LiveSessionExecuteRewindParams {
  viewerId?: string
}

export interface CreateSessionProcessManagerOptions {
  database: DatabaseService
  droidPath?: string
  droidSdkSessionFactory?: DroidSdkSessionFactory
  spawnProcess?: (request: SpawnProcessRequest) => SessionChildProcess
  isDroidProcess?: (processId: number) => boolean
  isProcessAlive?: (processId: number) => boolean
  now?: () => string
  reconnectDelayMs?: number
}

export type SessionEventSink = (event: SessionEvent) => void

export type ManagedSessionStatus =
  | 'active'
  | 'waiting'
  | 'idle'
  | 'completed'
  | 'disconnected'
  | 'reconnecting'
  | 'error'

export interface ManagedSession {
  sessionId: string
  title: string
  cwd: string | null
  createdAt: string
  updatedAt: string
  parentSessionId: string | null
  processId: number | null
  transport: StreamJsonRpcProcessTransportLike | null
  messages: LiveSessionMessage[]
  events: SessionEvent[]
  availableModels: LiveSessionModel[]
  settings: LiveSessionSettings
  transcriptRevision: number
  viewerIds: Set<string>
  subscribers: Set<SessionEventSink>
  reconnectPromise: Promise<void> | null
  workingStatus: ManagedSessionStatus
  lastEventAt: string | null
}

/**
 * Minimal interface for the session transport as seen by session state helpers.
 * Avoids circular dependencies between shared session types and transport implementations.
 */
export interface StreamJsonRpcProcessTransportLike {
  readonly processId: number
  subscribe(sink: SessionEventSink): () => void
  initializeSession(requestId: RequestId, cwd: string): Promise<StreamJsonRpcInitializeResult>
  loadSession(requestId: RequestId, sessionId: string): Promise<StreamJsonRpcLoadResult>
  interruptSession(requestId: RequestId): Promise<void>
  addUserMessage(requestId: RequestId, text: string): Promise<void>
  forkSession(requestId: RequestId): Promise<{ newSessionId: string }>
  getRewindInfo(requestId: RequestId, messageId: string): Promise<LiveSessionRewindInfo>
  executeRewind(
    requestId: RequestId,
    params: LiveSessionExecuteRewindParams,
  ): Promise<Omit<LiveSessionExecuteRewindResult, 'snapshot'>>
  compactSession(
    requestId: RequestId,
    customInstructions?: string,
  ): Promise<Omit<LiveSessionCompactResult, 'snapshot'>>
  renameSession?(requestId: RequestId, title: string): Promise<void>
  updateSessionSettings(requestId: RequestId, settings: Partial<LiveSessionSettings>): Promise<void>
  resolvePermissionRequest(requestId: RequestId, selectedOption: string): Promise<void>
  resolveAskUserRequest(
    requestId: RequestId,
    answers: LiveSessionAskUserAnswerRecord[],
  ): Promise<void>
  dispose(): Promise<void>
}

// Re-export the SessionEventRole type for use in LiveSessionMessage
import type { SessionEventRole } from '../protocol/sessionEvents'

export type { SessionEventRole }
