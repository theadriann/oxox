export type PluginCapabilityKind = 'app-action' | 'foundation-reader' | 'session-action'
export type PluginSandboxPermission = 'app:read' | 'foundation:read' | 'session:read'

export interface PluginCapabilityManifest {
  kind: PluginCapabilityKind
  name: string
  displayName: string
}

export interface LocalPluginSandbox {
  kind: 'node-process'
  permissions: PluginSandboxPermission[]
}

export interface LocalPluginManifest {
  id: string
  displayName: string
  version: string
  entryPoint: string
  capabilities: PluginCapabilityManifest[]
  sandbox: LocalPluginSandbox
}

export interface PluginHostSnapshot {
  pluginId: string
  processId: number | null
  status: 'error' | 'running' | 'starting' | 'stopped'
  lastError: string | null
}

export interface PluginCapabilityRecord {
  qualifiedId: string
  pluginId: string
  kind: PluginCapabilityKind
  name: string
  displayName: string
}

export interface PluginCapabilityInvokeResult {
  capabilityId: string
  payload: unknown
}

export interface PluginCapabilityInvokeMessage {
  type: 'capability.invoke'
  protocolVersion: '1.0.0'
  requestId: string
  capabilityId: string
  payload?: unknown
}

export interface PluginHostReadyMessage {
  type: 'host.ready'
  protocolVersion: '1.0.0'
}

export interface PluginHostErrorMessage {
  type: 'host.error'
  protocolVersion: '1.0.0'
  message: string
}

export interface PluginCapabilityResultMessage {
  type: 'capability.result'
  protocolVersion: '1.0.0'
  requestId: string
  payload: unknown
}

export interface PluginCapabilityErrorMessage {
  type: 'capability.error'
  protocolVersion: '1.0.0'
  requestId: string
  message: string
}

export type PluginHostMessage =
  | PluginHostReadyMessage
  | PluginHostErrorMessage
  | PluginCapabilityResultMessage
  | PluginCapabilityErrorMessage
