import { type Observable, observable } from '@legendapp/state'

export type TransportStatus = 'connected' | 'reconnecting' | 'disconnected'

export interface TransportState {
  status: TransportStatus
  protocol: string
}

export function createDefaultTransportState(): TransportState {
  return {
    status: 'disconnected',
    protocol: 'artifacts',
  }
}

export function createTransportState$(): Observable<TransportState> {
  return observable(createDefaultTransportState())
}
