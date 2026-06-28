import { type Observable, observable } from '@legendapp/state'
import type { PluginHostSnapshot } from '../../../../shared/plugins/contracts'

export interface PluginHostState {
  hostsByPluginId: Record<string, PluginHostSnapshot>
  refreshError: string | null
}

export function createDefaultPluginHostState(): PluginHostState {
  return {
    hostsByPluginId: {},
    refreshError: null,
  }
}

export function createPluginHostState$(): Observable<PluginHostState> {
  return observable(createDefaultPluginHostState())
}
