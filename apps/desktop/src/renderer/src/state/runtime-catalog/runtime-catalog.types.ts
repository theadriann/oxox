import type {
  LiveSessionContextStatsInfo,
  LiveSessionMcpAuthCodeRequest,
  LiveSessionMcpRegistryServerInfo,
  LiveSessionMcpServerConfig,
  LiveSessionMcpServerInfo,
  LiveSessionMcpToolInfo,
  LiveSessionSettings,
  LiveSessionSkillInfo,
  LiveSessionToolInfo,
} from '../../../../shared/ipc/contracts'

export interface SessionRuntimeCatalogApi {
  listTools?: (sessionId: string) => Promise<LiveSessionToolInfo[]>
  listSkills?: (sessionId: string) => Promise<LiveSessionSkillInfo[]>
  listMcpServers?: (sessionId: string) => Promise<LiveSessionMcpServerInfo[]>
  listMcpTools?: (sessionId: string) => Promise<LiveSessionMcpToolInfo[]>
  listMcpRegistry?: (sessionId: string) => Promise<LiveSessionMcpRegistryServerInfo[]>
  addMcpServer?: (sessionId: string, config: LiveSessionMcpServerConfig) => Promise<void>
  removeMcpServer?: (sessionId: string, serverName: string) => Promise<void>
  toggleMcpServer?: (sessionId: string, serverName: string, enabled: boolean) => Promise<void>
  authenticateMcpServer?: (sessionId: string, serverName: string) => Promise<void>
  cancelMcpAuth?: (sessionId: string, serverName: string) => Promise<void>
  clearMcpAuth?: (sessionId: string, serverName: string) => Promise<void>
  submitMcpAuthCode?: (sessionId: string, request: LiveSessionMcpAuthCodeRequest) => Promise<void>
  toggleMcpTool?: (
    sessionId: string,
    serverName: string,
    toolName: string,
    enabled: boolean,
  ) => Promise<void>
  getContextStats?: (sessionId: string) => Promise<LiveSessionContextStatsInfo | null>
  updateSettings?: (sessionId: string, settings: Partial<LiveSessionSettings>) => Promise<void>
}

export interface SessionRuntimeCatalogState {
  contextStats: LiveSessionContextStatsInfo | null
  mcpRegistry: LiveSessionMcpRegistryServerInfo[]
  mcpServers: LiveSessionMcpServerInfo[]
  mcpTools: LiveSessionMcpToolInfo[]
  refreshError: string | null
  sessionId: string | null
  skills: LiveSessionSkillInfo[]
  tools: LiveSessionToolInfo[]
  updatingToolLlmId: string | null
  updatingMcpServerName: string | null
  updatingMcpToolKey: string | null
}
