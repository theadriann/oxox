import { type Observable, observable } from '@legendapp/state'
import type { SessionRuntimeCatalogState } from './runtime-catalog.types'

export function createDefaultSessionRuntimeCatalogState(): SessionRuntimeCatalogState {
  return {
    contextStats: null,
    mcpRegistry: [],
    mcpServers: [],
    mcpTools: [],
    refreshError: null,
    sessionId: null,
    skills: [],
    tools: [],
    updatingToolLlmId: null,
    updatingMcpServerName: null,
    updatingMcpToolKey: null,
  }
}

export function createSessionRuntimeCatalogState$(): Observable<SessionRuntimeCatalogState> {
  return observable(createDefaultSessionRuntimeCatalogState())
}
