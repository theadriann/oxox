import { makeAutoObservable, runInAction } from 'mobx'

import type { PluginHostSnapshot } from '../../../shared/plugins/contracts'

type PluginHostLoader = () => Promise<PluginHostSnapshot[]>

const EMPTY_PLUGIN_HOST_LOADER: PluginHostLoader = async () => []

export class PluginHostStore {
  private readonly hostLoader: PluginHostLoader

  private readonly hostsByPluginId = new Map<string, PluginHostSnapshot>()
  refreshError: string | null = null

  constructor(hostLoader: PluginHostLoader = EMPTY_PLUGIN_HOST_LOADER) {
    this.hostLoader = hostLoader
    makeAutoObservable(this, { hostLoader: false }, { autoBind: true })
  }

  get hosts(): PluginHostSnapshot[] {
    return Array.from(this.hostsByPluginId.values()).sort((left, right) =>
      left.pluginId.localeCompare(right.pluginId),
    )
  }

  get runningHosts(): PluginHostSnapshot[] {
    return this.hosts.filter((host) => host.status === 'running')
  }

  async refresh(): Promise<void> {
    try {
      const hosts = await this.hostLoader()
      runInAction(() => {
        this.hostsByPluginId.clear()

        for (const host of hosts) {
          this.hostsByPluginId.set(host.pluginId, host)
        }

        this.refreshError = null
      })
    } catch (error) {
      runInAction(() => {
        this.refreshError = error instanceof Error ? error.message : 'Unable to load plugin hosts.'
        this.hostsByPluginId.clear()
      })
    }
  }

  applySnapshot(snapshot: PluginHostSnapshot): void {
    this.hostsByPluginId.set(snapshot.pluginId, snapshot)
    this.refreshError = null
  }
}
