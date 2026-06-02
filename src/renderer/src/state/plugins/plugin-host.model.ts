import { batch, type Observable } from '@legendapp/state'
import type { PluginHostSnapshot } from '../../../../shared/plugins/contracts'
import { createPluginHostState$, type PluginHostState } from './plugin-host.state'

type PluginHostLoader = () => Promise<PluginHostSnapshot[]>

const EMPTY_PLUGIN_HOST_LOADER: PluginHostLoader = async () => []

export class PluginHostStore {
  private readonly hostLoader: PluginHostLoader

  readonly state$: Observable<PluginHostState> = createPluginHostState$()

  constructor(hostLoader: PluginHostLoader = EMPTY_PLUGIN_HOST_LOADER) {
    this.hostLoader = hostLoader
  }

  get refreshError(): string | null {
    return this.state$.refreshError.get()
  }

  set refreshError(value: string | null) {
    this.state$.refreshError.set(value)
  }

  get hosts(): PluginHostSnapshot[] {
    return Object.values(this.state$.hostsByPluginId.get()).sort((left, right) =>
      left.pluginId.localeCompare(right.pluginId),
    )
  }

  get runningHosts(): PluginHostSnapshot[] {
    return this.hosts.filter((host) => host.status === 'running')
  }

  refresh = async (): Promise<void> => {
    try {
      const hosts = await this.hostLoader()
      batch(() => {
        this.state$.hostsByPluginId.set(
          Object.fromEntries(hosts.map((host) => [host.pluginId, host])),
        )
        this.refreshError = null
      })
    } catch (error) {
      batch(() => {
        this.refreshError = error instanceof Error ? error.message : 'Unable to load plugin hosts.'
        this.state$.hostsByPluginId.set({})
      })
    }
  }

  applySnapshot = (snapshot: PluginHostSnapshot): void => {
    this.state$.hostsByPluginId.set({
      ...this.state$.hostsByPluginId.peek(),
      [snapshot.pluginId]: snapshot,
    })
    this.refreshError = null
  }
}
