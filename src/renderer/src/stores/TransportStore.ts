import type { FoundationBootstrap } from '../../../shared/ipc/contracts'
import { bindMethods, observable, readField, writeField } from './legend'
import type { StoreEventBus } from './storeEventBus'

export type TransportStatus = 'connected' | 'reconnecting' | 'disconnected'

export class TransportStore {
  readonly stateNode = observable({
    status: 'disconnected' as TransportStatus,
    protocol: 'artifacts',
  })

  constructor() {
    bindMethods(this)
  }

  get status(): TransportStatus {
    return readField(this.stateNode, 'status')
  }

  set status(value: TransportStatus) {
    writeField(this.stateNode, 'status', value)
  }

  get protocol(): string {
    return readField(this.stateNode, 'protocol')
  }

  set protocol(value: string) {
    writeField(this.stateNode, 'protocol', value)
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
