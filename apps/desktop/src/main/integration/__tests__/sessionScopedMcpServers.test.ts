import { describe, expect, it, vi } from 'vitest'

import { createSessionScopedMcpServersLifecycleHook } from '../mcp/sessionScopedMcpServers'

describe('session-scoped MCP server lifecycle hook', () => {
  it('starts SDK MCP servers for initialize and merges existing MCP server configs', async () => {
    const mcpServer = {
      start: vi.fn().mockResolvedValue({
        type: 'http',
        name: 'oxox',
        url: 'http://127.0.0.1:1234/mcp',
        headers: [],
      }),
      close: vi.fn().mockResolvedValue(undefined),
    }
    const hook = createSessionScopedMcpServersLifecycleHook(() => [mcpServer])

    const extension = await hook.prepareInitialize?.({
      getSessionId: () => 'session-1',
      request: {
        cwd: '/tmp/project',
        settings: {
          mcpServers: [
            {
              type: 'stdio',
              name: 'existing',
              command: 'existing-mcp',
              args: [],
              env: {},
            },
          ],
        },
      },
    })

    expect(mcpServer.start).toHaveBeenCalledTimes(1)
    expect(extension?.params).toMatchObject({
      mcpServers: [
        {
          type: 'stdio',
          name: 'existing',
          command: 'existing-mcp',
        },
        {
          type: 'http',
          name: 'oxox',
          url: 'http://127.0.0.1:1234/mcp',
        },
      ],
    })

    await extension?.cleanup?.()

    expect(mcpServer.close).toHaveBeenCalledTimes(1)
  })

  it('starts SDK MCP servers for load without leaking session concerns into live session', async () => {
    const mcpServer = {
      start: vi.fn().mockResolvedValue({
        type: 'http',
        name: 'oxox',
        url: 'http://127.0.0.1:1234/mcp',
        headers: [],
      }),
      close: vi.fn().mockResolvedValue(undefined),
    }
    const createMcpServers = vi.fn(() => [mcpServer])
    const hook = createSessionScopedMcpServersLifecycleHook(createMcpServers)

    const extension = await hook.prepareLoad?.({
      getSessionId: () => 'session-1',
      sessionId: 'session-1',
    })

    expect(createMcpServers).toHaveBeenCalledWith({ getSessionId: expect.any(Function) })
    expect(extension?.params).toMatchObject({
      mcpServers: [
        {
          type: 'http',
          name: 'oxox',
          url: 'http://127.0.0.1:1234/mcp',
        },
      ],
    })
  })
})
