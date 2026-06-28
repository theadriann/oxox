import { createSdkMcpServer, type SdkMcpServer } from '@factory/droid-sdk'

import type { PluginCapabilityKind } from '../../../shared/plugins/contracts'
import type { PluginRegistry, RegisteredPluginCapability } from '../../app/PluginRegistry'
import type { LocalPluginHostManager } from '../plugins/localPluginHost'

export const OXOX_CAPABILITY_GATEWAY_TOOL_NAMES = {
  discover: 'oxox_discover_capabilities',
  describe: 'oxox_describe_capability',
  execute: 'oxox_execute_capability',
} as const

type OxoxCapabilityKind = Extract<PluginCapabilityKind, 'session-action'>

export interface OxoxCapabilityDescriptor {
  id: string
  kind: OxoxCapabilityKind
  displayName: string
  source: {
    type: 'local-plugin'
    pluginId: string
    pluginName?: string
    pluginVersion?: string
  }
}

export interface OxoxCapabilityDescription extends OxoxCapabilityDescriptor {
  inputSchema?: unknown
}

export interface OxoxCapabilityDiscoveryRequest {
  query?: string
  kind?: OxoxCapabilityKind
  limit?: number
}

export interface OxoxCapabilityExecuteRequest {
  capabilityId: string
  payload?: unknown
  sessionId?: string
}

export interface OxoxCapabilityProvider {
  discoverCapabilities(request: OxoxCapabilityDiscoveryRequest): OxoxCapabilityDescriptor[]
  describeCapability(capabilityId: string): OxoxCapabilityDescription | null
  executeCapability(request: OxoxCapabilityExecuteRequest): Promise<unknown>
}

export interface CreateOxoxCapabilityGatewayServerOptions {
  provider: OxoxCapabilityProvider
  getSessionId: () => string | null
}

export function createOxoxCapabilityGatewayServer({
  provider,
  getSessionId,
}: CreateOxoxCapabilityGatewayServerOptions): SdkMcpServer {
  return createSdkMcpServer({
    name: 'oxox',
    version: '1.0.0',
    tools: [
      {
        name: OXOX_CAPABILITY_GATEWAY_TOOL_NAMES.discover,
        description: 'Discover compact OXOX capabilities available to this session.',
        handler: async (input) =>
          stringifyToolResult({
            capabilities: provider.discoverCapabilities(parseDiscoveryInput(input)),
          }),
      },
      {
        name: OXOX_CAPABILITY_GATEWAY_TOOL_NAMES.describe,
        description: 'Fetch detailed metadata and input schema for one OXOX capability.',
        handler: async (input) => {
          const capabilityId = readRequiredString(input, 'capabilityId')
          const capability = provider.describeCapability(capabilityId)

          if (!capability) {
            throw new Error(`OXOX capability "${capabilityId}" is not available.`)
          }

          return stringifyToolResult(capability)
        },
      },
      {
        name: OXOX_CAPABILITY_GATEWAY_TOOL_NAMES.execute,
        description: 'Execute one OXOX capability by id with optional payload.',
        handler: async (input) => {
          const capabilityId = readRequiredString(input, 'capabilityId')
          const payload = isRecord(input) ? input.payload : undefined
          const result = await provider.executeCapability({
            capabilityId,
            payload,
            sessionId: getSessionId() ?? undefined,
          })

          return stringifyToolResult(result)
        },
      },
    ],
  })
}

export interface CreateLocalPluginCapabilityProviderOptions {
  pluginRegistry: PluginRegistry
  pluginHost: Pick<LocalPluginHostManager, 'invokeCapability'>
}

export function createLocalPluginCapabilityProvider({
  pluginRegistry,
  pluginHost,
}: CreateLocalPluginCapabilityProviderOptions): OxoxCapabilityProvider {
  const toDescriptor = (
    capability: RegisteredPluginCapability,
  ): OxoxCapabilityDescriptor | null => {
    if (capability.capability.kind !== 'session-action') {
      return null
    }

    const plugin = pluginRegistry.get(capability.pluginId)
    if (!plugin?.manifest.sandbox.permissions.includes('session:read')) {
      return null
    }

    return {
      id: capability.qualifiedId,
      kind: capability.capability.kind,
      displayName: capability.capability.displayName,
      source: {
        type: 'local-plugin',
        pluginId: plugin.manifest.id,
        pluginName: plugin.manifest.displayName,
        pluginVersion: plugin.manifest.version,
      },
    }
  }

  const describe = (capabilityId: string): OxoxCapabilityDescription | null => {
    const capability = pluginRegistry.resolveCapability(capabilityId)
    if (!capability) {
      return null
    }

    const descriptor = toDescriptor(capability)
    if (!descriptor) {
      return null
    }

    return {
      ...descriptor,
      inputSchema: {
        type: 'object',
        additionalProperties: true,
      },
    }
  }

  return {
    discoverCapabilities: ({ query, kind, limit }) => {
      const normalizedQuery = query?.trim().toLowerCase()
      const maxResults = normalizeLimit(limit)
      const capabilities = pluginRegistry
        .listCapabilities(kind)
        .map(toDescriptor)
        .filter((capability): capability is OxoxCapabilityDescriptor => capability !== null)
        .filter((capability) =>
          normalizedQuery
            ? `${capability.id} ${capability.displayName}`.toLowerCase().includes(normalizedQuery)
            : true,
        )

      return capabilities.slice(0, maxResults)
    },
    describeCapability: describe,
    executeCapability: async ({ capabilityId, payload, sessionId }) => {
      const capability = describe(capabilityId)
      if (!capability) {
        throw new Error(`OXOX capability "${capabilityId}" is not available.`)
      }
      if (!sessionId) {
        throw new Error(`OXOX capability "${capabilityId}" requires an active session.`)
      }

      return pluginHost.invokeCapability(capabilityId, withSessionIdPayload(payload, sessionId))
    },
  }
}

function parseDiscoveryInput(input: Record<string, unknown>): OxoxCapabilityDiscoveryRequest {
  return {
    query: readOptionalString(input, 'query'),
    kind: readOptionalCapabilityKind(input, 'kind'),
    limit: readOptionalNumber(input, 'limit'),
  }
}

function readRequiredString(input: Record<string, unknown>, key: string): string {
  const value = input[key]
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`Expected "${key}" to be a non-empty string.`)
  }

  return value
}

function readOptionalString(input: Record<string, unknown>, key: string): string | undefined {
  const value = input[key]
  return typeof value === 'string' && value.trim().length > 0 ? value : undefined
}

function readOptionalNumber(input: Record<string, unknown>, key: string): number | undefined {
  const value = input[key]
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

function readOptionalCapabilityKind(
  input: Record<string, unknown>,
  key: string,
): OxoxCapabilityKind | undefined {
  const value = input[key]
  return value === 'session-action' ? value : undefined
}

function normalizeLimit(limit: number | undefined): number {
  if (limit === undefined) {
    return 20
  }

  return Math.max(1, Math.min(Math.floor(limit), 50))
}

function withSessionIdPayload(payload: unknown, sessionId: string): Record<string, unknown> {
  if (isRecord(payload)) {
    return {
      ...payload,
      sessionId,
    }
  }

  return payload === undefined ? { sessionId } : { input: payload, sessionId }
}

function stringifyToolResult(value: unknown): string {
  return JSON.stringify(value)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}
