import type { McpServerConfig, SdkMcpServer } from '@factory/droid-sdk'

import type { DroidSdkMcpServerFactory } from '../droidSdk/factory'
import type { OxoxLiveDroidSessionLifecycleHook } from '../droidSdk/liveDroidSessionLifecycle'
import type { InitializeSessionRequest } from '../sessions/types'

interface StartedSessionScopedMcpServers {
  configs: McpServerConfig[]
  cleanup: () => Promise<void>
}

export function createSessionScopedMcpServersLifecycleHook(
  createMcpServers: DroidSdkMcpServerFactory,
): OxoxLiveDroidSessionLifecycleHook {
  return {
    prepareInitialize: async ({ getSessionId, request }) => {
      const startedServers = await startSessionScopedMcpServers(createMcpServers({ getSessionId }))
      const existingMcpServers = getExistingMcpServers(request.settings)

      return {
        cleanup: startedServers.cleanup,
        params:
          existingMcpServers.length > 0 || startedServers.configs.length > 0
            ? { mcpServers: [...existingMcpServers, ...startedServers.configs] }
            : {},
      }
    },
    prepareLoad: async ({ getSessionId }) => {
      const startedServers = await startSessionScopedMcpServers(createMcpServers({ getSessionId }))

      return {
        cleanup: startedServers.cleanup,
        params: startedServers.configs.length > 0 ? { mcpServers: startedServers.configs } : {},
      }
    },
  }
}

async function startSessionScopedMcpServers(
  servers: Array<Pick<SdkMcpServer, 'start' | 'close'>>,
): Promise<StartedSessionScopedMcpServers> {
  if (servers.length === 0) {
    return {
      configs: [],
      cleanup: async () => undefined,
    }
  }

  const startedServers: Array<Pick<SdkMcpServer, 'close'>> = []
  const configs: McpServerConfig[] = []

  try {
    for (const server of servers) {
      configs.push(await server.start())
      startedServers.push(server)
    }
  } catch (error) {
    await Promise.all(startedServers.map((server) => server.close()))
    throw error
  }

  return {
    configs,
    cleanup: async () => {
      await Promise.all(startedServers.map((server) => server.close()))
    },
  }
}

function getExistingMcpServers(settings: InitializeSessionRequest['settings']): McpServerConfig[] {
  const value = settings?.mcpServers
  return Array.isArray(value) ? (value as McpServerConfig[]) : []
}
