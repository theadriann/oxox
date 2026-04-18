import type {
  LiveSessionMcpServerInfo,
  LiveSessionSettings,
  LiveSessionSkillInfo,
  LiveSessionToolInfo,
} from '../../../shared/ipc/contracts'
import { batch, bindMethods, observable, readField, writeField } from './legend'

interface SessionRuntimeCatalogApi {
  listTools?: (sessionId: string) => Promise<LiveSessionToolInfo[]>
  listSkills?: (sessionId: string) => Promise<LiveSessionSkillInfo[]>
  listMcpServers?: (sessionId: string) => Promise<LiveSessionMcpServerInfo[]>
  updateSettings?: (sessionId: string, settings: Partial<LiveSessionSettings>) => Promise<void>
}

export class SessionRuntimeCatalogStore {
  private readonly api: SessionRuntimeCatalogApi
  private lastRefreshKey: string | null = null

  readonly stateNode = observable({
    mcpServers: [] as LiveSessionMcpServerInfo[],
    refreshError: null as string | null,
    sessionId: null as string | null,
    skills: [] as LiveSessionSkillInfo[],
    tools: [] as LiveSessionToolInfo[],
    updatingToolLlmId: null as string | null,
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

  clear(): void {
    batch(() => {
      this.sessionId = null
      this.tools = []
      this.skills = []
      this.mcpServers = []
      this.refreshError = null
      this.updatingToolLlmId = null
    })
    this.lastRefreshKey = null
  }

  async refresh(sessionId: string, refreshKey = sessionId): Promise<void> {
    if (this.lastRefreshKey === refreshKey && this.refreshError === null) {
      return
    }

    try {
      const [tools, skills, mcpServers] = await Promise.all([
        this.api.listTools?.(sessionId) ?? Promise.resolve([]),
        this.api.listSkills?.(sessionId) ?? Promise.resolve([]),
        this.api.listMcpServers?.(sessionId) ?? Promise.resolve([]),
      ])

      batch(() => {
        this.sessionId = sessionId
        this.tools = tools
        this.skills = skills
        this.mcpServers = mcpServers
        this.refreshError = null
      })
      this.lastRefreshKey = refreshKey
    } catch (error) {
      batch(() => {
        this.sessionId = sessionId
        this.tools = []
        this.skills = []
        this.mcpServers = []
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
