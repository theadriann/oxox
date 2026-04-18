import type { PluginHostSnapshot } from '../../../shared/plugins/contracts'
import { batch, bindMethods, observable, readField, writeField } from './legend'

type PluginHostLoader = () => Promise<PluginHostSnapshot[]>

const EMPTY_PLUGIN_HOST_LOADER: PluginHostLoader = async () => []

export class PluginHostStore {
  private readonly hostLoader: PluginHostLoader

  readonly stateNode = observable({
    hostsByPluginId: new Map<string, PluginHostSnapshot>(),
    refreshError: null as string | null,
  })

  constructor(hostLoader: PluginHostLoader = EMPTY_PLUGIN_HOST_LOADER) {
    this.hostLoader = hostLoader
    bindMethods(this)
  }

  get refreshError(): string | null {
    return readField(this.stateNode, 'refreshError')
  }

  set refreshError(value: string | null) {
    writeField(this.stateNode, 'refreshError', value)
  }

  get hosts(): PluginHostSnapshot[] {
    return Array.from(this.stateNode.hostsByPluginId.get().values()).sort((left, right) =>
      left.pluginId.localeCompare(right.pluginId),
    )
  }

  get runningHosts(): PluginHostSnapshot[] {
    return this.hosts.filter((host) => host.status === 'running')
  }

  async refresh(): Promise<void> {
    try {
      const hosts = await this.hostLoader()
      batch(() => {
        this.stateNode.hostsByPluginId.clear()
        for (const host of hosts) {
          this.stateNode.hostsByPluginId.set(host.pluginId, host)
        }
        this.refreshError = null
      })
    } catch (error) {
      batch(() => {
        this.refreshError = error instanceof Error ? error.message : 'Unable to load plugin hosts.'
        this.stateNode.hostsByPluginId.clear()
      })
    }
  }

  applySnapshot(snapshot: PluginHostSnapshot): void {
    this.stateNode.hostsByPluginId.set(snapshot.pluginId, snapshot)
    this.refreshError = null
  }
}
