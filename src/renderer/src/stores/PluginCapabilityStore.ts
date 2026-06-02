import { batch, type Observable, observable } from '@legendapp/state'
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

interface PluginCapabilityState {
  capabilitiesById: Record<string, PluginCapabilityRecord>
  invocationError: string | null
  refreshError: string | null
}

export class PluginCapabilityStore {
  private readonly capabilityLoader: PluginCapabilityLoader
  private readonly capabilityInvoker: PluginCapabilityInvoker

  readonly state$: Observable<PluginCapabilityState> = observable({
    capabilitiesById: {},
    invocationError: null,
    refreshError: null,
  })

  constructor(
    capabilityLoader: PluginCapabilityLoader = EMPTY_PLUGIN_CAPABILITY_LOADER,
    capabilityInvoker: PluginCapabilityInvoker = MISSING_PLUGIN_CAPABILITY_INVOKER,
  ) {
    this.capabilityLoader = capabilityLoader
    this.capabilityInvoker = capabilityInvoker
  }

  get invocationError(): string | null {
    return this.state$.invocationError.get()
  }

  set invocationError(value: string | null) {
    this.state$.invocationError.set(value)
  }

  get refreshError(): string | null {
    return this.state$.refreshError.get()
  }

  set refreshError(value: string | null) {
    this.state$.refreshError.set(value)
  }

  get capabilities(): PluginCapabilityRecord[] {
    return Object.values(this.state$.capabilitiesById.get()).sort((left, right) =>
      left.displayName.localeCompare(right.displayName),
    )
  }

  get appActions(): PluginCapabilityRecord[] {
    return this.capabilities.filter((capability) => capability.kind === 'app-action')
  }

  get sessionActions(): PluginCapabilityRecord[] {
    return this.capabilities.filter((capability) => capability.kind === 'session-action')
  }

  refresh = async (): Promise<void> => {
    try {
      const capabilities = await this.capabilityLoader()
      batch(() => {
        this.state$.capabilitiesById.set(
          Object.fromEntries(
            capabilities.map((capability) => [capability.qualifiedId, capability]),
          ),
        )
        this.refreshError = null
      })
    } catch (error) {
      batch(() => {
        this.state$.capabilitiesById.set({})
        this.refreshError =
          error instanceof Error ? error.message : 'Unable to load plugin capabilities.'
      })
    }
  }

  invoke = async (
    capabilityId: string,
    payload?: unknown,
  ): Promise<PluginCapabilityInvokeResult> => {
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
