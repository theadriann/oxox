import { protocol } from '@factory/droid-sdk'

import type { StreamJsonRpcProcessTransportLike } from '../sessions/types'

type TransportMethodName = Extract<keyof StreamJsonRpcProcessTransportLike, string>

export const DROID_SDK_TRANSPORT_PARITY_METHODS = [
  'subscribe',
  'initializeSession',
  'loadSession',
  'interruptSession',
  'addUserMessage',
  'forkSession',
  'getRewindInfo',
  'executeRewind',
  'compactSession',
  'renameSession',
  'listSkills',
  'listMcpServers',
  'listMcpTools',
  'listMcpRegistry',
  'addMcpServer',
  'removeMcpServer',
  'toggleMcpServer',
  'authenticateMcpServer',
  'cancelMcpAuth',
  'clearMcpAuth',
  'submitMcpAuthCode',
  'toggleMcpTool',
  'killWorkerSession',
  'submitBugReport',
  'getContextStats',
  'updateSessionSettings',
  'resolvePermissionRequest',
  'resolveAskUserRequest',
  'dispose',
] as const satisfies readonly TransportMethodName[]

export const DROID_SDK_PROCESS_ONLY_METHODS = [
  'listTools',
] as const satisfies readonly TransportMethodName[]

const DAEMON_METHOD = protocol.daemon.DaemonDroidMethod

export const DROID_SDK_DAEMON_LIVE_METHODS = [
  DAEMON_METHOD.LIST_MCP_REGISTRY,
  DAEMON_METHOD.CANCEL_MCP_AUTH,
  DAEMON_METHOD.CLEAR_MCP_AUTH,
  DAEMON_METHOD.SUBMIT_MCP_AUTH_CODE,
  DAEMON_METHOD.TOGGLE_MCP_TOOL,
  DAEMON_METHOD.KILL_WORKER_SESSION,
  DAEMON_METHOD.SUBMIT_BUG_REPORT,
] as const

export const REQUIRED_DROID_SDK_SMALL_EXPORT_AREAS = [
  'errors',
  'stream-utilities',
  'session-wrapper',
  'schemas',
  'helpers',
  'hooks',
  'run-api',
  'protocol-engine',
] as const

type DroidSdkSmallExportArea = (typeof REQUIRED_DROID_SDK_SMALL_EXPORT_AREAS)[number]
type DroidSdkSmallExportDecision = 'adopted' | 'deferred' | 'sdk-only'

interface DroidSdkSmallExportParityEntry {
  readonly area: DroidSdkSmallExportArea
  readonly decision: DroidSdkSmallExportDecision
  readonly adoptedExports?: readonly string[]
  readonly rationale: string
  readonly followUp?: string
}

export const DROID_SDK_SMALL_EXPORT_PARITY_MATRIX = [
  {
    area: 'errors',
    decision: 'adopted',
    adoptedExports: ['ProcessExitError'],
    rationale:
      'OXOX uses SDK error classes where they preserve runtime semantics, currently to treat clean Droid process exits as non-recoverable noise.',
  },
  {
    area: 'stream-utilities',
    decision: 'adopted',
    adoptedExports: ['convertNotificationToStreamMessage', 'StreamStateTracker'],
    rationale:
      'OXOX delegates SDK notification-to-stream conversion and stream state tracking while retaining app-owned persistence and renderer event mapping.',
  },
  {
    area: 'session-wrapper',
    decision: 'adopted',
    adoptedExports: ['DroidClient', 'DroidSession', 'SDK_TAG'],
    rationale:
      'OXOX wraps SDK live-session primitives while preserving app-owned message IDs, queue placement, pending prompts, and viewer state.',
  },
  {
    area: 'schemas',
    decision: 'adopted',
    rationale:
      'OXOX uses public SDK schemas and constants as drift guards for settings and JSON-RPC protocol envelopes without replacing app-owned IPC contracts.',
  },
  {
    area: 'helpers',
    decision: 'deferred',
    rationale:
      'SDK helpers are not package-public from @factory/droid-sdk, so OXOX should not import helper internals or SDK implementation subpaths.',
    followUp:
      'Revisit initialization helper adoption only if equivalent helpers are exposed from the top-level SDK package.',
  },
  {
    area: 'hooks',
    decision: 'sdk-only',
    rationale:
      'Hook input/output types should remain SDK-only until OXOX authors or executes Droid hook files as part of a product feature.',
  },
  {
    area: 'run-api',
    decision: 'sdk-only',
    rationale:
      'The run() API is a one-shot convenience helper, while OXOX needs a persistent live-session runtime with renderer state and transcript persistence.',
  },
  {
    area: 'protocol-engine',
    decision: 'sdk-only',
    rationale:
      'OXOX should consume ProtocolEngine and dispatchNotification through DroidClient instead of replacing SDK internals or losing app-specific request tracking.',
  },
] as const satisfies readonly DroidSdkSmallExportParityEntry[]
