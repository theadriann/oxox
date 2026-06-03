import { configureTranscriptPerformanceLogger } from '../../diagnostics/transcriptPerformance'
import type { PlatformApiClient } from '../../platform/apiClient'
import { createLocalStoragePort, type PersistencePort } from '../../platform/persistence'

import { ComposerStore } from '../composer/composer.model'
import { createStoreEventBus } from '../events/store-event-bus'
import { FoundationStore } from '../foundation/foundation.model'
import { LiveSessionStore } from '../live-sessions/live-session.model'
import { ModelPickerStore } from '../model-picker/model-picker.model'
import { PluginCapabilityStore } from '../plugins/plugin-capability.model'
import { PluginHostStore } from '../plugins/plugin-host.model'
import { SessionRuntimeCatalogStore } from '../runtime-catalog/runtime-catalog.model'
import { SessionStore } from '../sessions/session.model'
import { TranscriptStore } from '../transcripts/transcript.model'
import { TransportStore } from '../transport/transport.model'
import { UIStore } from '../ui/ui.model'
import { UpdateStore } from '../updates/update.model'

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
  readonly modelPickerStore: ModelPickerStore
  readonly updateStore: UpdateStore
  private readonly disposers: Array<() => void> = []

  constructor(api: PlatformApiClient, persistence: PersistencePort = createLocalStoragePort()) {
    this.api = api
    this.persistence = persistence
    configureTranscriptPerformanceLogger(api.diagnostics.logTranscriptPerformance)
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
      addMcpServer: this.api.session.addMcpServer,
      authenticateMcpServer: this.api.session.authenticateMcpServer,
      cancelMcpAuth: this.api.session.cancelMcpAuth,
      clearMcpAuth: this.api.session.clearMcpAuth,
      listMcpRegistry: this.api.session.listMcpRegistry,
      listMcpServers: this.api.session.listMcpServers,
      listMcpTools: this.api.session.listMcpTools,
      listSkills: this.api.session.listSkills,
      listTools: this.api.session.listTools,
      removeMcpServer: this.api.session.removeMcpServer,
      submitMcpAuthCode: this.api.session.submitMcpAuthCode,
      toggleMcpServer: this.api.session.toggleMcpServer,
      toggleMcpTool: this.api.session.toggleMcpTool,
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
    this.modelPickerStore = new ModelPickerStore(persistence)
  }

  dispose(): void {
    for (const dispose of this.disposers.splice(0)) {
      dispose()
    }

    this.foundationStore.dispose()
    this.modelPickerStore.dispose()
  }
}
