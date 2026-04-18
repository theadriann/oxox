import { describe, expect, it, vi } from 'vitest'

import type {
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
  it('refreshes tools, skills, and MCP servers through the injected loaders', async () => {
    const listTools = vi.fn().mockResolvedValue([createTool()])
    const listSkills = vi.fn().mockResolvedValue([createSkill()])
    const listMcpServers = vi.fn().mockResolvedValue([createMcpServer()])
    const store = new SessionRuntimeCatalogStore({
      listMcpServers,
      listSkills,
      listTools,
    })

    await store.refresh('session-1')

    expect(listTools).toHaveBeenCalledWith('session-1')
    expect(listSkills).toHaveBeenCalledWith('session-1')
    expect(listMcpServers).toHaveBeenCalledWith('session-1')
    expect(store.tools).toEqual([createTool()])
    expect(store.skills).toEqual([createSkill()])
    expect(store.mcpServers).toEqual([createMcpServer()])
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
})
