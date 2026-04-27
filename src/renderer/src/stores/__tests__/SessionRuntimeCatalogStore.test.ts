import { describe, expect, it, vi } from 'vitest'

import type {
  LiveSessionContextStatsInfo,
  LiveSessionMcpServerInfo,
  LiveSessionSettings,
  LiveSessionSkillInfo,
  LiveSessionToolInfo,
} from '../../../../shared/ipc/contracts'
import {
  buildToolSelectionSettingsPatch,
  SessionRuntimeCatalogStore,
} from '../SessionRuntimeCatalogStore'

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
          enabledToolIds: ['Glob'],
        },
        createTool(),
        false,
      ),
    ).toEqual({
      enabledToolIds: ['Glob'],
      disabledToolIds: ['Read'],
    } satisfies Partial<LiveSessionSettings>)
  })

  it('removes explicit overrides when a tool is restored to its default permission', () => {
    expect(
      buildToolSelectionSettingsPatch(
        {
          enabledToolIds: ['Read'],
          disabledToolIds: ['Execute'],
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
      disabledToolIds: ['Execute'],
    } satisfies Partial<LiveSessionSettings>)
  })
})

describe('SessionRuntimeCatalogStore', () => {
  it('refreshes tools, skills, MCP servers, and context stats through the injected loaders', async () => {
    const listTools = vi.fn().mockResolvedValue([createTool()])
    const listSkills = vi.fn().mockResolvedValue([createSkill()])
    const listMcpServers = vi.fn().mockResolvedValue([createMcpServer()])
    const getContextStats = vi.fn().mockResolvedValue(createContextStats())
    const store = new SessionRuntimeCatalogStore({
      getContextStats,
      listMcpServers,
      listSkills,
      listTools,
    })

    await store.refresh('session-1')

    expect(listTools).toHaveBeenCalledWith('session-1')
    expect(listSkills).toHaveBeenCalledWith('session-1')
    expect(listMcpServers).toHaveBeenCalledWith('session-1')
    expect(getContextStats).toHaveBeenCalledWith('session-1')
    expect(store.tools).toEqual([createTool()])
    expect(store.skills).toEqual([createSkill()])
    expect(store.mcpServers).toEqual([createMcpServer()])
    expect(store.contextStats).toEqual(createContextStats())
    expect(store.refreshError).toBeNull()
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
    await store.setToolAllowed('session-1', { disabledToolIds: ['Execute'] }, 'Read', false)

    expect(updateSettings).toHaveBeenCalledWith('session-1', {
      enabledToolIds: [],
      disabledToolIds: ['Execute', 'Read'],
    })
    expect(store.tools).toEqual([createTool({ currentlyAllowed: false })])
    expect(store.updatingToolLlmId).toBeNull()
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
