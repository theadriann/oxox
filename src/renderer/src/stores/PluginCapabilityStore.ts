import { makeAutoObservable, runInAction } from 'mobx'

import type {
  PluginCapabilityInvokeResult,
  PluginCapabilityRecord,
} from '../../../shared/plugins/contracts'

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

  private readonly capabilitiesById = new Map<string, PluginCapabilityRecord>()
  invocationError: string | null = null
  refreshError: string | null = null

  constructor(
    capabilityLoader: PluginCapabilityLoader = EMPTY_PLUGIN_CAPABILITY_LOADER,
    capabilityInvoker: PluginCapabilityInvoker = MISSING_PLUGIN_CAPABILITY_INVOKER,
  ) {
    this.capabilityLoader = capabilityLoader
    this.capabilityInvoker = capabilityInvoker
    makeAutoObservable(
      this,
      { capabilityInvoker: false, capabilityLoader: false },
      { autoBind: true },
    )
  }

  get capabilities(): PluginCapabilityRecord[] {
    return Array.from(this.capabilitiesById.values()).sort((left, right) =>
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
      runInAction(() => {
        this.capabilitiesById.clear()

        for (const capability of capabilities) {
          this.capabilitiesById.set(capability.qualifiedId, capability)
        }

        this.refreshError = null
      })
    } catch (error) {
      runInAction(() => {
        this.capabilitiesById.clear()
        this.refreshError =
          error instanceof Error ? error.message : 'Unable to load plugin capabilities.'
      })
    }
  }

  async invoke(capabilityId: string, payload?: unknown): Promise<PluginCapabilityInvokeResult> {
    try {
      const result = await this.capabilityInvoker(capabilityId, payload)
      runInAction(() => {
        this.invocationError = null
      })
      return result
    } catch (error) {
      runInAction(() => {
        this.invocationError =
          error instanceof Error ? error.message : 'Unable to invoke plugin capability.'
      })
      throw error
    }
  }
}
