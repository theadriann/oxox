import { makeAutoObservable } from 'mobx'

import type { FoundationBootstrap } from '../../../shared/ipc/contracts'
import type { StoreEventBus } from './storeEventBus'

export type TransportStatus = 'connected' | 'reconnecting' | 'disconnected'

export class TransportStore {
  status: TransportStatus = 'disconnected'
  protocol = 'artifacts'

  constructor() {
    makeAutoObservable(this, {}, { autoBind: true })
  }

  hydrateFoundation(bootstrap: FoundationBootstrap): void {
    const nextProtocol = bootstrap.daemon.status === 'connected' ? 'daemon' : 'artifacts'

    if (this.status !== bootstrap.daemon.status) {
      this.status = bootstrap.daemon.status
    }

    if (this.protocol !== nextProtocol) {
      this.protocol = nextProtocol
    }
  }

  connectToEventBus(bus: StoreEventBus): () => void {
    return bus.subscribe('foundation-hydrate', ({ bootstrap }) => {
      this.hydrateFoundation(bootstrap)
    })
  }
}
