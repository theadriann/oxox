import { type Observable, observable } from '@legendapp/state'
import type { PluginCapabilityRecord } from '../../../../shared/plugins/contracts'

export interface PluginCapabilityState {
  capabilitiesById: Record<string, PluginCapabilityRecord>
  invocationError: string | null
  refreshError: string | null
}

export function createDefaultPluginCapabilityState(): PluginCapabilityState {
  return {
    capabilitiesById: {},
    invocationError: null,
    refreshError: null,
  }
}

export function createPluginCapabilityState$(): Observable<PluginCapabilityState> {
  return observable(createDefaultPluginCapabilityState())
}
