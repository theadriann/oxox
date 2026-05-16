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
} from '../../../shared/ipc/contracts'
import { batch, bindMethods, observable, readField, writeField } from './legend'

interface SessionRuntimeCatalogApi {
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

export class SessionRuntimeCatalogStore {
  private readonly api: SessionRuntimeCatalogApi
  private lastRefreshKey: string | null = null

  readonly stateNode = observable({
    contextStats: null as LiveSessionContextStatsInfo | null,
    mcpRegistry: [] as LiveSessionMcpRegistryServerInfo[],
    mcpServers: [] as LiveSessionMcpServerInfo[],
    mcpTools: [] as LiveSessionMcpToolInfo[],
    refreshError: null as string | null,
    sessionId: null as string | null,
    skills: [] as LiveSessionSkillInfo[],
    tools: [] as LiveSessionToolInfo[],
    updatingToolLlmId: null as string | null,
    updatingMcpServerName: null as string | null,
    updatingMcpToolKey: null as string | null,
  })

  constructor(api: SessionRuntimeCatalogApi = {}) {
    this.api = api
    bindMethods(this)
  }

  get sessionId(): string | null {
    return readField(this.stateNode, 'sessionId')
  }

  set sessionId(value: string | null) {
    writeField(this.stateNode, 'sessionId', value)
  }

  get tools(): LiveSessionToolInfo[] {
    return readField(this.stateNode, 'tools')
  }

  set tools(value: LiveSessionToolInfo[]) {
    writeField(this.stateNode, 'tools', value)
  }

  get skills(): LiveSessionSkillInfo[] {
    return readField(this.stateNode, 'skills')
  }

  set skills(value: LiveSessionSkillInfo[]) {
    writeField(this.stateNode, 'skills', value)
  }

  get mcpServers(): LiveSessionMcpServerInfo[] {
    return readField(this.stateNode, 'mcpServers')
  }

  set mcpServers(value: LiveSessionMcpServerInfo[]) {
    writeField(this.stateNode, 'mcpServers', value)
  }

  get mcpTools(): LiveSessionMcpToolInfo[] {
    return readField(this.stateNode, 'mcpTools')
  }

  set mcpTools(value: LiveSessionMcpToolInfo[]) {
    writeField(this.stateNode, 'mcpTools', value)
  }

  get mcpRegistry(): LiveSessionMcpRegistryServerInfo[] {
    return readField(this.stateNode, 'mcpRegistry')
  }

  set mcpRegistry(value: LiveSessionMcpRegistryServerInfo[]) {
    writeField(this.stateNode, 'mcpRegistry', value)
  }

  get contextStats(): LiveSessionContextStatsInfo | null {
    return readField(this.stateNode, 'contextStats')
  }

  set contextStats(value: LiveSessionContextStatsInfo | null) {
    writeField(this.stateNode, 'contextStats', value)
  }

  get refreshError(): string | null {
    return readField(this.stateNode, 'refreshError')
  }

  set refreshError(value: string | null) {
    writeField(this.stateNode, 'refreshError', value)
  }

  get updatingToolLlmId(): string | null {
    return readField(this.stateNode, 'updatingToolLlmId')
  }

  set updatingToolLlmId(value: string | null) {
    writeField(this.stateNode, 'updatingToolLlmId', value)
  }

  get updatingMcpServerName(): string | null {
    return readField(this.stateNode, 'updatingMcpServerName')
  }

  set updatingMcpServerName(value: string | null) {
    writeField(this.stateNode, 'updatingMcpServerName', value)
  }

  get updatingMcpToolKey(): string | null {
    return readField(this.stateNode, 'updatingMcpToolKey')
  }

  set updatingMcpToolKey(value: string | null) {
    writeField(this.stateNode, 'updatingMcpToolKey', value)
  }

  clear(): void {
    batch(() => {
      this.sessionId = null
      this.tools = []
      this.skills = []
      this.mcpServers = []
      this.mcpTools = []
      this.mcpRegistry = []
      this.contextStats = null
      this.refreshError = null
      this.updatingToolLlmId = null
      this.updatingMcpServerName = null
      this.updatingMcpToolKey = null
    })
    this.lastRefreshKey = null
  }

  async refresh(sessionId: string, refreshKey = sessionId): Promise<void> {
    if (this.lastRefreshKey === refreshKey && this.refreshError === null) {
      return
    }

    try {
      const [tools, skills, mcpServers, mcpTools, mcpRegistry, contextStats] = await Promise.all([
        this.api.listTools?.(sessionId) ?? Promise.resolve([]),
        this.api.listSkills?.(sessionId) ?? Promise.resolve([]),
        this.api.listMcpServers?.(sessionId) ?? Promise.resolve([]),
        this.api.listMcpTools?.(sessionId) ?? Promise.resolve([]),
        this.api.listMcpRegistry?.(sessionId) ?? Promise.resolve([]),
        this.api.getContextStats?.(sessionId) ?? Promise.resolve(null),
      ])

      batch(() => {
        this.sessionId = sessionId
        this.tools = tools
        this.skills = skills
        this.mcpServers = mcpServers
        this.mcpTools = mcpTools
        this.mcpRegistry = mcpRegistry
        this.contextStats = contextStats
        this.refreshError = null
      })
      this.lastRefreshKey = refreshKey
    } catch (error) {
      batch(() => {
        this.sessionId = sessionId
        this.tools = []
        this.skills = []
        this.mcpServers = []
        this.mcpTools = []
        this.mcpRegistry = []
        this.contextStats = null
        this.refreshError =
          error instanceof Error ? error.message : 'Unable to load session runtime catalog.'
      })
      this.lastRefreshKey = null
    }
  }

  async setToolAllowed(
    sessionId: string,
    settings: Partial<LiveSessionSettings>,
    toolLlmId: string,
    allowed: boolean,
  ): Promise<void> {
    const tool = this.tools.find((entry) => entry.llmId === toolLlmId)

    if (!tool || !this.api.updateSettings) {
      return
    }

    batch(() => {
      this.updatingToolLlmId = toolLlmId
      this.refreshError = null
    })

    try {
      await this.api.updateSettings(
        sessionId,
        buildToolSelectionSettingsPatch(settings, tool, allowed),
      )

      this.tools = this.tools.map((entry) =>
        entry.llmId === toolLlmId ? { ...entry, currentlyAllowed: allowed } : entry,
      )
    } catch (error) {
      this.refreshError =
        error instanceof Error ? error.message : 'Unable to update tool permissions.'
      throw error
    } finally {
      this.updatingToolLlmId = null
    }
  }

  async addRegistryMcpServer(
    sessionId: string,
    server: LiveSessionMcpRegistryServerInfo,
  ): Promise<void> {
    if (!this.api.addMcpServer) {
      return
    }

    await this.runServerMutation(server.name, async () => {
      await this.api.addMcpServer?.(sessionId, registryServerToConfig(server))
      await this.refresh(sessionId, `${sessionId}:mcp-add:${Date.now().toString()}`)
    })
  }

  async removeMcpServer(sessionId: string, serverName: string): Promise<void> {
    if (!this.api.removeMcpServer) {
      return
    }

    await this.runServerMutation(serverName, async () => {
      await this.api.removeMcpServer?.(sessionId, serverName)
      this.mcpServers = this.mcpServers.filter((server) => server.name !== serverName)
      await this.refresh(sessionId, `${sessionId}:mcp-remove:${Date.now().toString()}`)
    })
  }

  async setMcpServerEnabled(
    sessionId: string,
    serverName: string,
    enabled: boolean,
  ): Promise<void> {
    if (!this.api.toggleMcpServer) {
      return
    }

    await this.runServerMutation(serverName, async () => {
      await this.api.toggleMcpServer?.(sessionId, serverName, enabled)
      this.mcpServers = this.mcpServers.map((server) =>
        server.name === serverName
          ? { ...server, status: enabled ? 'connecting' : 'disabled' }
          : server,
      )
      await this.refresh(sessionId, `${sessionId}:mcp-toggle:${Date.now().toString()}`)
    })
  }

  async authenticateMcpServer(sessionId: string, serverName: string): Promise<void> {
    if (!this.api.authenticateMcpServer) {
      return
    }

    await this.runServerMutation(serverName, async () => {
      await this.api.authenticateMcpServer?.(sessionId, serverName)
      await this.refresh(sessionId, `${sessionId}:mcp-auth:${Date.now().toString()}`)
    })
  }

  async clearMcpAuth(sessionId: string, serverName: string): Promise<void> {
    if (!this.api.clearMcpAuth) {
      return
    }

    await this.runServerMutation(serverName, async () => {
      await this.api.clearMcpAuth?.(sessionId, serverName)
      await this.refresh(sessionId, `${sessionId}:mcp-clear-auth:${Date.now().toString()}`)
    })
  }

  async cancelMcpAuth(sessionId: string, serverName: string): Promise<void> {
    if (!this.api.cancelMcpAuth) {
      return
    }

    await this.runServerMutation(serverName, async () => {
      await this.api.cancelMcpAuth?.(sessionId, serverName)
      await this.refresh(sessionId, `${sessionId}:mcp-cancel-auth:${Date.now().toString()}`)
    })
  }

  async submitMcpAuthCode(
    sessionId: string,
    request: LiveSessionMcpAuthCodeRequest,
  ): Promise<void> {
    if (!this.api.submitMcpAuthCode) {
      return
    }

    await this.runServerMutation(request.serverName, async () => {
      await this.api.submitMcpAuthCode?.(sessionId, request)
      await this.refresh(sessionId, `${sessionId}:mcp-submit-auth:${Date.now().toString()}`)
    })
  }

  async setMcpToolEnabled(
    sessionId: string,
    serverName: string,
    toolName: string,
    enabled: boolean,
  ): Promise<void> {
    if (!this.api.toggleMcpTool) {
      return
    }

    const toolKey = `${serverName}:${toolName}`
    batch(() => {
      this.updatingMcpToolKey = toolKey
      this.refreshError = null
    })

    try {
      await this.api.toggleMcpTool(sessionId, serverName, toolName, enabled)
      this.mcpTools = this.mcpTools.map((tool) =>
        tool.serverName === serverName && tool.name === toolName
          ? { ...tool, isEnabled: enabled }
          : tool,
      )
    } catch (error) {
      this.refreshError = error instanceof Error ? error.message : 'Unable to update MCP tool.'
      throw error
    } finally {
      this.updatingMcpToolKey = null
    }
  }

  private async runServerMutation(
    serverName: string,
    mutation: () => Promise<void>,
  ): Promise<void> {
    batch(() => {
      this.updatingMcpServerName = serverName
      this.refreshError = null
    })

    try {
      await mutation()
    } catch (error) {
      this.refreshError = error instanceof Error ? error.message : 'Unable to update MCP server.'
      throw error
    } finally {
      this.updatingMcpServerName = null
    }
  }
}

export function buildToolSelectionSettingsPatch(
  settings: Partial<LiveSessionSettings>,
  tool: Pick<LiveSessionToolInfo, 'defaultAllowed' | 'llmId'>,
  allowed: boolean,
): Partial<LiveSessionSettings> {
  const enabledToolIds = new Set(settings.enabledToolIds ?? [])
  const disabledToolIds = new Set(settings.disabledToolIds ?? [])

  enabledToolIds.delete(tool.llmId)
  disabledToolIds.delete(tool.llmId)

  if (allowed !== tool.defaultAllowed) {
    if (allowed) {
      enabledToolIds.add(tool.llmId)
    } else {
      disabledToolIds.add(tool.llmId)
    }
  }

  return {
    enabledToolIds: [...enabledToolIds].sort(),
    disabledToolIds: [...disabledToolIds].sort(),
  }
}

function registryServerToConfig(
  server: LiveSessionMcpRegistryServerInfo,
): LiveSessionMcpServerConfig {
  return {
    name: server.name,
    type: server.type,
    ...(server.url ? { url: server.url } : {}),
    ...(server.command ? { command: server.command } : {}),
    ...(server.args ? { args: server.args } : {}),
  }
}
