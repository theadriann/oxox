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
