import type { PlatformApiClient } from '../platform/apiClient'
import { createLocalStoragePort, type PersistencePort } from '../platform/persistence'

import { ComposerStore } from './ComposerStore'
import { FoundationStore } from './FoundationStore'
import { LiveSessionStore } from './LiveSessionStore'
import { PluginCapabilityStore } from './PluginCapabilityStore'
import { PluginHostStore } from './PluginHostStore'
import { SessionRuntimeCatalogStore } from './SessionRuntimeCatalogStore'
import { SessionStore } from './SessionStore'
import { createStoreEventBus } from './storeEventBus'
import { TranscriptStore } from './TranscriptStore'
import { TransportStore } from './TransportStore'
import { UIStore } from './UIStore'
import { UpdateStore } from './UpdateStore'

export class RootStore {
  readonly api: PlatformApiClient
  readonly persistence: PersistencePort
  readonly storeEventBus = createStoreEventBus()
  readonly sessionStore: SessionStore
  readonly transcriptStore: TranscriptStore
  readonly transportStore: TransportStore
  readonly uiStore: UIStore
  readonly liveSessionStore: LiveSessionStore
  readonly foundationStore: FoundationStore
  readonly pluginCapabilityStore: PluginCapabilityStore
  readonly pluginHostStore: PluginHostStore
  readonly sessionRuntimeCatalogStore: SessionRuntimeCatalogStore
  readonly composerStore: ComposerStore
  readonly updateStore: UpdateStore
  private readonly disposers: Array<() => void> = []

  constructor(api: PlatformApiClient, persistence: PersistencePort = createLocalStoragePort()) {
    this.api = api
    this.persistence = persistence
    this.sessionStore = new SessionStore(persistence)
    const getSessionTranscript = this.api.transcript.getSessionTranscript
    const getSnapshot = this.api.session.getSnapshot

    this.transcriptStore = new TranscriptStore((sessionId) => {
      if (!getSessionTranscript) {
        throw new Error('Transcript bridge unavailable.')
      }

      return getSessionTranscript(sessionId)
    })
    this.transportStore = new TransportStore()
    this.uiStore = new UIStore(persistence)
    const listCapabilities = this.api.plugin.listCapabilities
    const listHosts = this.api.plugin.listHosts
    const invokeCapability = this.api.plugin.invokeCapability
    this.liveSessionStore = new LiveSessionStore(
      () => this.sessionStore.selectedSessionId || null,
      this.storeEventBus,
      getSnapshot ? (sessionId) => getSnapshot(sessionId) : async () => null,
      (sessionId) => this.sessionStore.sessions.find((session) => session.id === sessionId),
    )
    this.pluginCapabilityStore = new PluginCapabilityStore(
      listCapabilities ? () => listCapabilities() : async () => [],
      invokeCapability
        ? (capabilityId, payload) => invokeCapability(capabilityId, payload)
        : undefined,
    )
    this.pluginHostStore = new PluginHostStore(listHosts ? () => listHosts() : async () => [])
    this.sessionRuntimeCatalogStore = new SessionRuntimeCatalogStore({
      getContextStats: this.api.session.getContextStats,
      listMcpServers: this.api.session.listMcpServers,
      listSkills: this.api.session.listSkills,
      listTools: this.api.session.listTools,
      updateSettings: this.api.session.updateSettings,
    })
    this.updateStore = new UpdateStore(this.api.app)
    this.foundationStore = new FoundationStore(this.storeEventBus, {
      getBootstrap: this.api.foundation.getBootstrap,
      getRuntimeInfo: this.api.runtime.getInfo,
    })
    this.disposers.push(this.sessionStore.connectToEventBus(this.storeEventBus))
    this.disposers.push(this.transportStore.connectToEventBus(this.storeEventBus))
    this.composerStore = new ComposerStore(
      this.sessionStore,
      this.liveSessionStore,
      this.foundationStore,
      this.api.session,
      persistence,
      () => this.sessionRuntimeCatalogStore.contextStats,
    )
  }

  dispose(): void {
    for (const dispose of this.disposers.splice(0)) {
      dispose()
    }

    this.foundationStore.dispose()
  }
}
