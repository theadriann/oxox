import { batch, type Observable } from '@legendapp/state'
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
import { createSessionRuntimeCatalogState$ } from './runtime-catalog.state'
import type { SessionRuntimeCatalogApi, SessionRuntimeCatalogState } from './runtime-catalog.types'

export class SessionRuntimeCatalogStore {
  private readonly api: SessionRuntimeCatalogApi
  private lastRefreshKey: string | null = null

  readonly state$: Observable<SessionRuntimeCatalogState> = createSessionRuntimeCatalogState$()

  constructor(api: SessionRuntimeCatalogApi = {}) {
    this.api = api
  }

  get sessionId(): string | null {
    return this.state$.sessionId.get()
  }

  set sessionId(value: string | null) {
    this.state$.sessionId.set(value)
  }

  get tools(): LiveSessionToolInfo[] {
    return this.state$.tools.get()
  }

  set tools(value: LiveSessionToolInfo[]) {
    this.state$.tools.set(value)
  }

  get skills(): LiveSessionSkillInfo[] {
    return this.state$.skills.get()
  }

  set skills(value: LiveSessionSkillInfo[]) {
    this.state$.skills.set(value)
  }

  get mcpServers(): LiveSessionMcpServerInfo[] {
    return this.state$.mcpServers.get()
  }

  set mcpServers(value: LiveSessionMcpServerInfo[]) {
    this.state$.mcpServers.set(value)
  }

  get mcpTools(): LiveSessionMcpToolInfo[] {
    return this.state$.mcpTools.get()
  }

  set mcpTools(value: LiveSessionMcpToolInfo[]) {
    this.state$.mcpTools.set(value)
  }

  get mcpRegistry(): LiveSessionMcpRegistryServerInfo[] {
    return this.state$.mcpRegistry.get()
  }

  set mcpRegistry(value: LiveSessionMcpRegistryServerInfo[]) {
    this.state$.mcpRegistry.set(value)
  }

  get contextStats(): LiveSessionContextStatsInfo | null {
    return this.state$.contextStats.get()
  }

  set contextStats(value: LiveSessionContextStatsInfo | null) {
    this.state$.contextStats.set(value)
  }

  get refreshError(): string | null {
    return this.state$.refreshError.get()
  }

  set refreshError(value: string | null) {
    this.state$.refreshError.set(value)
  }

  get updatingToolLlmId(): string | null {
    return this.state$.updatingToolLlmId.get()
  }

  set updatingToolLlmId(value: string | null) {
    this.state$.updatingToolLlmId.set(value)
  }

  get updatingMcpServerName(): string | null {
    return this.state$.updatingMcpServerName.get()
  }

  set updatingMcpServerName(value: string | null) {
    this.state$.updatingMcpServerName.set(value)
  }

  get updatingMcpToolKey(): string | null {
    return this.state$.updatingMcpToolKey.get()
  }

  set updatingMcpToolKey(value: string | null) {
    this.state$.updatingMcpToolKey.set(value)
  }

  clear = (): void => {
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

  refresh = async (sessionId: string, refreshKey = sessionId): Promise<void> => {
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

  setToolAllowed = async (
    sessionId: string,
    settings: Partial<LiveSessionSettings>,
    toolLlmId: string,
    allowed: boolean,
  ): Promise<void> => {
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

  addRegistryMcpServer = async (
    sessionId: string,
    server: LiveSessionMcpRegistryServerInfo,
  ): Promise<void> => {
    if (!this.api.addMcpServer) {
      return
    }

    await this.runServerMutation(server.name, async () => {
      await this.api.addMcpServer?.(sessionId, registryServerToConfig(server))
      await this.refresh(sessionId, `${sessionId}:mcp-add:${Date.now().toString()}`)
    })
  }

  removeMcpServer = async (sessionId: string, serverName: string): Promise<void> => {
    if (!this.api.removeMcpServer) {
      return
    }

    await this.runServerMutation(serverName, async () => {
      await this.api.removeMcpServer?.(sessionId, serverName)
      this.mcpServers = this.mcpServers.filter((server) => server.name !== serverName)
      await this.refresh(sessionId, `${sessionId}:mcp-remove:${Date.now().toString()}`)
    })
  }

  setMcpServerEnabled = async (
    sessionId: string,
    serverName: string,
    enabled: boolean,
  ): Promise<void> => {
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

  authenticateMcpServer = async (sessionId: string, serverName: string): Promise<void> => {
    if (!this.api.authenticateMcpServer) {
      return
    }

    await this.runServerMutation(serverName, async () => {
      await this.api.authenticateMcpServer?.(sessionId, serverName)
      await this.refresh(sessionId, `${sessionId}:mcp-auth:${Date.now().toString()}`)
    })
  }

  clearMcpAuth = async (sessionId: string, serverName: string): Promise<void> => {
    if (!this.api.clearMcpAuth) {
      return
    }

    await this.runServerMutation(serverName, async () => {
      await this.api.clearMcpAuth?.(sessionId, serverName)
      await this.refresh(sessionId, `${sessionId}:mcp-clear-auth:${Date.now().toString()}`)
    })
  }

  cancelMcpAuth = async (sessionId: string, serverName: string): Promise<void> => {
    if (!this.api.cancelMcpAuth) {
      return
    }

    await this.runServerMutation(serverName, async () => {
      await this.api.cancelMcpAuth?.(sessionId, serverName)
      await this.refresh(sessionId, `${sessionId}:mcp-cancel-auth:${Date.now().toString()}`)
    })
  }

  submitMcpAuthCode = async (
    sessionId: string,
    request: LiveSessionMcpAuthCodeRequest,
  ): Promise<void> => {
    if (!this.api.submitMcpAuthCode) {
      return
    }

    await this.runServerMutation(request.serverName, async () => {
      await this.api.submitMcpAuthCode?.(sessionId, request)
      await this.refresh(sessionId, `${sessionId}:mcp-submit-auth:${Date.now().toString()}`)
    })
  }

  setMcpToolEnabled = async (
    sessionId: string,
    serverName: string,
    toolName: string,
    enabled: boolean,
  ): Promise<void> => {
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
