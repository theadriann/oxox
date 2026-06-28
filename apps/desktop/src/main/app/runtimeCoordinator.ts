import type { LiveSessionEventRecord } from '../../shared/ipc/contracts'
import type { FoundationService } from '../integration/foundationService'
import type { LocalPluginHostManager } from '../integration/plugins/localPluginHost'

interface LiveSessionEventPayload {
  sessionId: string
  event: LiveSessionEventRecord
}

interface StartRuntimeCoordinatorOptions {
  foundationService: Pick<
    FoundationService,
    | 'subscribeToFoundationUpdates'
    | 'subscribeToLiveSessionEvents'
    | 'subscribeToLiveSessionSnapshots'
  >
  pluginHost: Pick<LocalPluginHostManager, 'subscribe'>
  broadcastFoundationChanged: (payload: { refreshedAt: string }) => void
  broadcastLiveSessionEvent: (payload: LiveSessionEventPayload) => void
  broadcastLiveSessionSnapshot: (payload: { sessionId: string }) => void
  broadcastPluginHostSnapshot: (payload: { snapshot: unknown }) => void
  startPluginBootstrap: () => void
}

export function startRuntimeCoordinator({
  foundationService,
  pluginHost,
  broadcastFoundationChanged,
  broadcastLiveSessionEvent,
  broadcastLiveSessionSnapshot,
  broadcastPluginHostSnapshot,
  startPluginBootstrap,
}: StartRuntimeCoordinatorOptions): () => void {
  const unsubscribeFoundation = foundationService.subscribeToFoundationUpdates((payload) => {
    broadcastFoundationChanged(payload)
  })
  const unsubscribeLiveSnapshots = foundationService.subscribeToLiveSessionSnapshots(
    (sessionId) => {
      broadcastLiveSessionSnapshot({ sessionId })
    },
  )
  const unsubscribeLiveEvents = foundationService.subscribeToLiveSessionEvents((payload) => {
    broadcastLiveSessionEvent(payload)
  })
  const unsubscribePluginHost = pluginHost.subscribe((snapshot) => {
    broadcastPluginHostSnapshot({ snapshot })
  })

  startPluginBootstrap()

  return () => {
    unsubscribeFoundation()
    unsubscribeLiveSnapshots()
    unsubscribeLiveEvents()
    unsubscribePluginHost()
  }
}
