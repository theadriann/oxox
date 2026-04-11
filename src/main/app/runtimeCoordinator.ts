import type { FoundationService } from '../integration/foundationService'
import type { LocalPluginHostManager } from '../integration/plugins/localPluginHost'

interface StartRuntimeCoordinatorOptions {
  foundationService: Pick<
    FoundationService,
    'subscribeToFoundationUpdates' | 'subscribeToLiveSessionSnapshots'
  >
  pluginHost: Pick<LocalPluginHostManager, 'subscribe'>
  broadcastFoundationChanged: (payload: { refreshedAt: string }) => void
  broadcastLiveSessionSnapshot: (payload: { sessionId: string }) => void
  broadcastPluginHostSnapshot: (payload: { snapshot: unknown }) => void
  startPluginBootstrap: () => void
}

export function startRuntimeCoordinator({
  foundationService,
  pluginHost,
  broadcastFoundationChanged,
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
  const unsubscribePluginHost = pluginHost.subscribe((snapshot) => {
    broadcastPluginHostSnapshot({ snapshot })
  })

  startPluginBootstrap()

  return () => {
    unsubscribeFoundation()
    unsubscribeLiveSnapshots()
    unsubscribePluginHost()
  }
}
