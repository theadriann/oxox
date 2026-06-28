import { describe, expect, it, vi } from 'vitest'

import { PluginRegistry } from '../../app/PluginRegistry'
import {
  createLocalPluginCapabilityProvider,
  createOxoxCapabilityGatewayServer,
  OXOX_CAPABILITY_GATEWAY_TOOL_NAMES,
} from '../mcp/oxoxCapabilityGateway'

describe('OXOX capability MCP gateway', () => {
  it('exposes a small fixed MCP tool surface regardless of plugin capability count', () => {
    const provider = {
      discoverCapabilities: vi.fn(() => []),
      describeCapability: vi.fn(),
      executeCapability: vi.fn(),
    }

    const server = createOxoxCapabilityGatewayServer({
      provider,
      getSessionId: () => 'session-1',
    })

    expect(server.name).toBe('oxox')
    expect(server.tools.map((tool) => tool.name).sort()).toEqual(
      Object.values(OXOX_CAPABILITY_GATEWAY_TOOL_NAMES).sort(),
    )
  })

  it('keeps discovery compact and fetches capability details on demand', async () => {
    const provider = {
      discoverCapabilities: vi.fn(() => [
        {
          id: 'plugin.alpha:summarize',
          kind: 'session-action' as const,
          displayName: 'Summarize Session',
          source: { type: 'local-plugin' as const, pluginId: 'plugin.alpha' },
        },
      ]),
      describeCapability: vi.fn(() => ({
        id: 'plugin.alpha:summarize',
        kind: 'session-action' as const,
        displayName: 'Summarize Session',
        source: { type: 'local-plugin' as const, pluginId: 'plugin.alpha' },
        inputSchema: {
          type: 'object',
          properties: {
            style: { type: 'string' },
          },
        },
      })),
      executeCapability: vi.fn(),
    }
    const server = createOxoxCapabilityGatewayServer({
      provider,
      getSessionId: () => 'session-1',
    })

    const discover = server.tools.find(
      (tool) => tool.name === OXOX_CAPABILITY_GATEWAY_TOOL_NAMES.discover,
    )
    const describe = server.tools.find(
      (tool) => tool.name === OXOX_CAPABILITY_GATEWAY_TOOL_NAMES.describe,
    )

    await expect(discover?.handler({ query: 'summary' })).resolves.toBe(
      JSON.stringify({
        capabilities: [
          {
            id: 'plugin.alpha:summarize',
            kind: 'session-action',
            displayName: 'Summarize Session',
            source: { type: 'local-plugin', pluginId: 'plugin.alpha' },
          },
        ],
      }),
    )
    await expect(describe?.handler({ capabilityId: 'plugin.alpha:summarize' })).resolves.toContain(
      '"inputSchema"',
    )
    expect(provider.discoverCapabilities).toHaveBeenCalledWith({
      query: 'summary',
      kind: undefined,
      limit: undefined,
    })
  })

  it('injects the current OXOX session id when executing a capability', async () => {
    const provider = {
      discoverCapabilities: vi.fn(() => []),
      describeCapability: vi.fn(),
      executeCapability: vi.fn().mockResolvedValue({ ok: true }),
    }
    const server = createOxoxCapabilityGatewayServer({
      provider,
      getSessionId: () => 'session-1',
    })
    const execute = server.tools.find(
      (tool) => tool.name === OXOX_CAPABILITY_GATEWAY_TOOL_NAMES.execute,
    )

    await expect(
      execute?.handler({
        capabilityId: 'plugin.alpha:summarize',
        payload: { style: 'short' },
      }),
    ).resolves.toBe(JSON.stringify({ ok: true }))
    expect(provider.executeCapability).toHaveBeenCalledWith({
      capabilityId: 'plugin.alpha:summarize',
      payload: { style: 'short' },
      sessionId: 'session-1',
    })
  })

  it('adapts explicitly safe local plugin session-action capabilities', async () => {
    const pluginRegistry = new PluginRegistry()
    const pluginHost = {
      invokeCapability: vi.fn().mockResolvedValue({
        capabilityId: 'plugin.alpha:summarize',
        payload: { summary: 'done' },
      }),
    }
    pluginRegistry.register({
      id: 'plugin.alpha',
      displayName: 'Alpha Plugin',
      version: '1.0.0',
      entryPoint: './dist/index.js',
      capabilities: [
        {
          kind: 'session-action',
          name: 'summarize',
          displayName: 'Summarize Session',
        },
        {
          kind: 'app-action',
          name: 'open-window',
          displayName: 'Open Window',
        },
      ],
      sandbox: {
        kind: 'node-process',
        permissions: ['session:read'],
      },
    })

    const provider = createLocalPluginCapabilityProvider({
      pluginRegistry,
      pluginHost,
    })

    expect(provider.discoverCapabilities({})).toEqual([
      {
        id: 'plugin.alpha:summarize',
        kind: 'session-action',
        displayName: 'Summarize Session',
        source: {
          type: 'local-plugin',
          pluginId: 'plugin.alpha',
          pluginName: 'Alpha Plugin',
          pluginVersion: '1.0.0',
        },
      },
    ])
    await expect(
      provider.executeCapability({
        capabilityId: 'plugin.alpha:summarize',
        payload: { style: 'short' },
        sessionId: 'session-1',
      }),
    ).resolves.toEqual({
      capabilityId: 'plugin.alpha:summarize',
      payload: { summary: 'done' },
    })
    expect(pluginHost.invokeCapability).toHaveBeenCalledWith('plugin.alpha:summarize', {
      style: 'short',
      sessionId: 'session-1',
    })
  })
})
