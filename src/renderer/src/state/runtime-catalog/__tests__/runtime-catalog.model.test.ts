import { describe, expect, it, vi } from 'vitest'

import type {
  LiveSessionContextStatsInfo,
  LiveSessionMcpRegistryServerInfo,
  LiveSessionMcpServerInfo,
  LiveSessionMcpToolInfo,
  LiveSessionSettings,
  LiveSessionSkillInfo,
  LiveSessionToolInfo,
} from '../../../../../shared/ipc/contracts'
import {
  buildToolSelectionSettingsPatch,
  SessionRuntimeCatalogStore,
} from '../runtime-catalog.model'

function createTool(overrides: Partial<LiveSessionToolInfo> = {}): LiveSessionToolInfo {
  return {
    id: 'tool-read',
    llmId: 'Read',
    displayName: 'Read',
    description: 'Read a file',
    category: 'read',
    defaultAllowed: true,
    currentlyAllowed: true,
    ...overrides,
  }
}

function createSkill(overrides: Partial<LiveSessionSkillInfo> = {}): LiveSessionSkillInfo {
  return {
    name: 'vault-knowledge',
    description: 'Search the project vault',
    location: 'personal',
    filePath: '/Users/test/.factory/skills/vault-knowledge/SKILL.md',
    enabled: true,
    userInvocable: true,
    ...overrides,
  }
}

function createMcpServer(
  overrides: Partial<LiveSessionMcpServerInfo> = {},
): LiveSessionMcpServerInfo {
  return {
    name: 'figma',
    status: 'connected',
    source: 'user',
    isManaged: false,
    toolCount: 12,
    serverType: 'http',
    hasAuthTokens: true,
    ...overrides,
  }
}

function createMcpTool(overrides: Partial<LiveSessionMcpToolInfo> = {}): LiveSessionMcpToolInfo {
  return {
    serverName: 'figma',
    name: 'get_design_context',
    description: 'Read Figma design context',
    isEnabled: true,
    isReadOnly: true,
    ...overrides,
  }
}

function createMcpRegistryServer(
  overrides: Partial<LiveSessionMcpRegistryServerInfo> = {},
): LiveSessionMcpRegistryServerInfo {
  return {
    name: 'playwright',
    description: 'Browser automation',
    type: 'stdio',
    command: 'npx',
    args: ['@playwright/mcp'],
    ...overrides,
  }
}

function createContextStats(
  overrides: Partial<LiveSessionContextStatsInfo> = {},
): LiveSessionContextStatsInfo {
  return {
    used: 12_345,
    remaining: 87_655,
    limit: 100_000,
    accuracy: 'exact',
    updatedAt: '2026-04-23T21:13:04.000Z',
    ...overrides,
  }
}

describe('buildToolSelectionSettingsPatch', () => {
  it('adds disabled tool overrides for default-allowed tools', () => {
    expect(
      buildToolSelectionSettingsPatch(
        {
          enabledToolIds: ['glob-cli'],
        },
        createTool(),
        false,
      ),
    ).toEqual({
      enabledToolIds: ['glob-cli'],
      disabledToolIds: ['tool-read'],
    } satisfies Partial<LiveSessionSettings>)
  })

  it('removes explicit overrides when a tool is restored to its default permission', () => {
    expect(
      buildToolSelectionSettingsPatch(
        {
          enabledToolIds: ['tool-read'],
          disabledToolIds: ['execute-cli'],
        },
        createTool({
          llmId: 'Read',
          defaultAllowed: false,
          currentlyAllowed: true,
        }),
        false,
      ),
    ).toEqual({
      enabledToolIds: [],
      disabledToolIds: ['execute-cli'],
    } satisfies Partial<LiveSessionSettings>)
  })
})

describe('SessionRuntimeCatalogStore', () => {
  it('refreshes tools, skills, MCP catalogs, and context stats through the injected loaders', async () => {
    const listTools = vi.fn().mockResolvedValue([createTool()])
    const listSkills = vi.fn().mockResolvedValue([createSkill()])
    const listMcpServers = vi.fn().mockResolvedValue([createMcpServer()])
    const listMcpTools = vi.fn().mockResolvedValue([createMcpTool()])
    const listMcpRegistry = vi.fn().mockResolvedValue([createMcpRegistryServer()])
    const getContextStats = vi.fn().mockResolvedValue(createContextStats())
    const store = new SessionRuntimeCatalogStore({
      getContextStats,
      listMcpRegistry,
      listMcpServers,
      listMcpTools,
      listSkills,
      listTools,
    })

    await store.refresh('session-1')

    expect(listTools).toHaveBeenCalledWith('session-1')
    expect(listSkills).toHaveBeenCalledWith('session-1')
    expect(listMcpServers).toHaveBeenCalledWith('session-1')
    expect(listMcpTools).toHaveBeenCalledWith('session-1')
    expect(listMcpRegistry).toHaveBeenCalledWith('session-1')
    expect(getContextStats).toHaveBeenCalledWith('session-1')
    expect(store.tools).toEqual([createTool()])
    expect(store.skills).toEqual([createSkill()])
    expect(store.mcpServers).toEqual([createMcpServer()])
    expect(store.mcpTools).toEqual([createMcpTool()])
    expect(store.mcpRegistry).toEqual([createMcpRegistryServer()])
    expect(store.contextStats).toEqual(createContextStats())
    expect(store.refreshError).toBeNull()
  })

  it('runs MCP server management actions and refreshes the catalog', async () => {
    const addMcpServer = vi.fn().mockResolvedValue(undefined)
    const toggleMcpServer = vi.fn().mockResolvedValue(undefined)
    const removeMcpServer = vi.fn().mockResolvedValue(undefined)
    const authenticateMcpServer = vi.fn().mockResolvedValue(undefined)
    const clearMcpAuth = vi.fn().mockResolvedValue(undefined)
    const listMcpServers = vi
      .fn()
      .mockResolvedValueOnce([createMcpServer({ name: 'playwright', isManaged: true })])
      .mockResolvedValue([])
    const store = new SessionRuntimeCatalogStore({
      addMcpServer,
      authenticateMcpServer,
      clearMcpAuth,
      listMcpRegistry: vi.fn().mockResolvedValue([createMcpRegistryServer()]),
      listMcpServers,
      listMcpTools: vi.fn().mockResolvedValue([]),
      listSkills: vi.fn().mockResolvedValue([]),
      listTools: vi.fn().mockResolvedValue([]),
      removeMcpServer,
      toggleMcpServer,
    })

    await store.refresh('session-1')
    await store.addRegistryMcpServer('session-1', createMcpRegistryServer())
    await store.setMcpServerEnabled('session-1', 'playwright', false)
    await store.authenticateMcpServer('session-1', 'playwright')
    await store.clearMcpAuth('session-1', 'playwright')
    await store.removeMcpServer('session-1', 'playwright')

    expect(addMcpServer).toHaveBeenCalledWith('session-1', {
      name: 'playwright',
      type: 'stdio',
      command: 'npx',
      args: ['@playwright/mcp'],
    })
    expect(toggleMcpServer).toHaveBeenCalledWith('session-1', 'playwright', false)
    expect(authenticateMcpServer).toHaveBeenCalledWith('session-1', 'playwright')
    expect(clearMcpAuth).toHaveBeenCalledWith('session-1', 'playwright')
    expect(removeMcpServer).toHaveBeenCalledWith('session-1', 'playwright')
    expect(store.updatingMcpServerName).toBeNull()
  })

  it('toggles MCP tools optimistically after the SDK call succeeds', async () => {
    const toggleMcpTool = vi.fn().mockResolvedValue(undefined)
    const store = new SessionRuntimeCatalogStore({
      listMcpServers: vi.fn().mockResolvedValue([]),
      listMcpTools: vi.fn().mockResolvedValue([createMcpTool()]),
      listSkills: vi.fn().mockResolvedValue([]),
      listTools: vi.fn().mockResolvedValue([]),
      toggleMcpTool,
    })

    await store.refresh('session-1')
    await store.setMcpToolEnabled('session-1', 'figma', 'get_design_context', false)

    expect(toggleMcpTool).toHaveBeenCalledWith('session-1', 'figma', 'get_design_context', false)
    expect(store.mcpTools).toEqual([createMcpTool({ isEnabled: false })])
    expect(store.updatingMcpToolKey).toBeNull()
  })

  it('skips MCP tool updates when the requested state already matches', async () => {
    const toggleMcpTool = vi.fn().mockResolvedValue(undefined)
    const store = new SessionRuntimeCatalogStore({
      listMcpServers: vi.fn().mockResolvedValue([]),
      listMcpTools: vi.fn().mockResolvedValue([createMcpTool()]),
      listSkills: vi.fn().mockResolvedValue([]),
      listTools: vi.fn().mockResolvedValue([]),
      toggleMcpTool,
    })

    await store.refresh('session-1')
    await store.setMcpToolEnabled('session-1', 'figma', 'get_design_context', true)

    expect(toggleMcpTool).not.toHaveBeenCalled()
    expect(store.updatingMcpToolKey).toBeNull()
    expect(store.mcpTools).toEqual([createMcpTool()])
  })

  it('skips MCP server updates when the requested state already matches', async () => {
    const toggleMcpServer = vi.fn().mockResolvedValue(undefined)
    const store = new SessionRuntimeCatalogStore({
      listMcpServers: vi.fn().mockResolvedValue([createMcpServer({ status: 'disabled' })]),
      listMcpTools: vi.fn().mockResolvedValue([]),
      listSkills: vi.fn().mockResolvedValue([]),
      listTools: vi.fn().mockResolvedValue([]),
      toggleMcpServer,
    })

    await store.refresh('session-1')
    await store.setMcpServerEnabled('session-1', 'figma', false)

    expect(toggleMcpServer).not.toHaveBeenCalled()
    expect(store.updatingMcpServerName).toBeNull()
    expect(store.mcpServers).toEqual([createMcpServer({ status: 'disabled' })])
  })

  it('updates tool permissions through session settings and reflects the new tool state', async () => {
    const updateSettings = vi.fn().mockResolvedValue(undefined)
    const store = new SessionRuntimeCatalogStore({
      listMcpServers: vi.fn().mockResolvedValue([]),
      listSkills: vi.fn().mockResolvedValue([]),
      listTools: vi.fn().mockResolvedValue([createTool()]),
      updateSettings,
    })

    await store.refresh('session-1')
    await store.setToolAllowed('session-1', { disabledToolIds: ['execute-cli'] }, 'Read', false)

    expect(updateSettings).toHaveBeenCalledWith('session-1', {
      enabledToolIds: [],
      disabledToolIds: ['execute-cli', 'tool-read'],
    })
    expect(store.tools).toEqual([createTool({ currentlyAllowed: false })])
    expect(store.updatingToolLlmId).toBeNull()
  })

  it('skips tool permission updates when the requested state already matches', async () => {
    const updateSettings = vi.fn().mockResolvedValue(undefined)
    const store = new SessionRuntimeCatalogStore({
      listMcpServers: vi.fn().mockResolvedValue([]),
      listSkills: vi.fn().mockResolvedValue([]),
      listTools: vi.fn().mockResolvedValue([createTool()]),
      updateSettings,
    })

    await store.refresh('session-1')
    await store.setToolAllowed('session-1', {}, 'Read', true)

    expect(updateSettings).not.toHaveBeenCalled()
    expect(store.updatingToolLlmId).toBeNull()
    expect(store.tools).toEqual([createTool()])
  })

  it('refreshes context stats when the refresh key changes after session activity', async () => {
    const getContextStats = vi
      .fn()
      .mockResolvedValueOnce(createContextStats({ used: 24_612, remaining: 165_388 }))
      .mockResolvedValueOnce(createContextStats({ used: 25_100, remaining: 164_900 }))
    const store = new SessionRuntimeCatalogStore({
      getContextStats,
      listMcpServers: vi.fn().mockResolvedValue([]),
      listSkills: vi.fn().mockResolvedValue([]),
      listTools: vi.fn().mockResolvedValue([]),
    })

    await store.refresh('session-1', 'session-1:revision-1')
    await store.refresh('session-1', 'session-1:revision-1')
    await store.refresh('session-1', 'session-1:revision-2')

    expect(getContextStats).toHaveBeenCalledTimes(2)
    expect(store.contextStats).toEqual(createContextStats({ used: 25_100, remaining: 164_900 }))
  })
})
