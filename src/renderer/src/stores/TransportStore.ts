import { type Observable, observable } from '@legendapp/state'
import type { FoundationBootstrap } from '../../../shared/ipc/contracts'
import type { StoreEventBus } from './storeEventBus'

export type TransportStatus = 'connected' | 'reconnecting' | 'disconnected'

interface TransportState {
  status: TransportStatus
  protocol: string
}

export class TransportStore {
  readonly state$: Observable<TransportState> = observable({
    status: 'disconnected',
    protocol: 'artifacts',
  })

  get status(): TransportStatus {
    return this.state$.status.get()
  }

  set status(value: TransportStatus) {
    this.state$.status.set(value)
  }

  get protocol(): string {
    return this.state$.protocol.get()
  }

  set protocol(value: string) {
    this.state$.protocol.set(value)
  }

  hydrateFoundation = (bootstrap: FoundationBootstrap): void => {
    const nextProtocol = bootstrap.daemon.status === 'connected' ? 'daemon' : 'artifacts'

    if (this.status !== bootstrap.daemon.status) {
      this.status = bootstrap.daemon.status
    }

    if (this.protocol !== nextProtocol) {
      this.protocol = nextProtocol
    }
  }

  connectToEventBus = (bus: StoreEventBus): (() => void) => {
    return bus.subscribe('foundation-hydrate', ({ bootstrap }) => {
      this.hydrateFoundation(bootstrap)
    })
  }
}
