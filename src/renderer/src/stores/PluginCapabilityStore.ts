import type {
  PluginCapabilityInvokeResult,
  PluginCapabilityRecord,
} from '../../../shared/plugins/contracts'
import { batch, bindMethods, observable, readField, writeField } from './legend'

type PluginCapabilityLoader = () => Promise<PluginCapabilityRecord[]>
type PluginCapabilityInvoker = (
  capabilityId: string,
  payload?: unknown,
) => Promise<PluginCapabilityInvokeResult>

const EMPTY_PLUGIN_CAPABILITY_LOADER: PluginCapabilityLoader = async () => []

const MISSING_PLUGIN_CAPABILITY_INVOKER: PluginCapabilityInvoker = async () => {
  throw new Error('Plugin capability bridge unavailable.')
}

export class PluginCapabilityStore {
  private readonly capabilityLoader: PluginCapabilityLoader
  private readonly capabilityInvoker: PluginCapabilityInvoker

  readonly stateNode = observable({
    capabilitiesById: new Map<string, PluginCapabilityRecord>(),
    invocationError: null as string | null,
    refreshError: null as string | null,
  })

  constructor(
    capabilityLoader: PluginCapabilityLoader = EMPTY_PLUGIN_CAPABILITY_LOADER,
    capabilityInvoker: PluginCapabilityInvoker = MISSING_PLUGIN_CAPABILITY_INVOKER,
  ) {
    this.capabilityLoader = capabilityLoader
    this.capabilityInvoker = capabilityInvoker
    bindMethods(this)
  }

  get invocationError(): string | null {
    return readField(this.stateNode, 'invocationError')
  }

  set invocationError(value: string | null) {
    writeField(this.stateNode, 'invocationError', value)
  }

  get refreshError(): string | null {
    return readField(this.stateNode, 'refreshError')
  }

  set refreshError(value: string | null) {
    writeField(this.stateNode, 'refreshError', value)
  }

  get capabilities(): PluginCapabilityRecord[] {
    return Array.from(this.stateNode.capabilitiesById.get().values()).sort((left, right) =>
      left.displayName.localeCompare(right.displayName),
    )
  }

  get appActions(): PluginCapabilityRecord[] {
    return this.capabilities.filter((capability) => capability.kind === 'app-action')
  }

  get sessionActions(): PluginCapabilityRecord[] {
    return this.capabilities.filter((capability) => capability.kind === 'session-action')
  }

  async refresh(): Promise<void> {
    try {
      const capabilities = await this.capabilityLoader()
      batch(() => {
        this.stateNode.capabilitiesById.clear()
        for (const capability of capabilities) {
          this.stateNode.capabilitiesById.set(capability.qualifiedId, capability)
        }
        this.refreshError = null
      })
    } catch (error) {
      batch(() => {
        this.stateNode.capabilitiesById.clear()
        this.refreshError =
          error instanceof Error ? error.message : 'Unable to load plugin capabilities.'
      })
    }
  }

  async invoke(capabilityId: string, payload?: unknown): Promise<PluginCapabilityInvokeResult> {
    try {
      const result = await this.capabilityInvoker(capabilityId, payload)
      batch(() => {
        this.invocationError = null
      })
      return result
    } catch (error) {
      batch(() => {
        this.invocationError =
          error instanceof Error ? error.message : 'Unable to invoke plugin capability.'
      })
      throw error
    }
  }
}
