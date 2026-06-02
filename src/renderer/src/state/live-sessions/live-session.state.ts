import { type Observable, observable } from '@legendapp/state'
import type { LiveSessionState } from './live-session.types'

export function createDefaultLiveSessionState(): LiveSessionState {
  return {
    snapshotsById: {},
    timelineItemsById: {},
  }
}

export function createLiveSessionState$(): Observable<LiveSessionState> {
  return observable(createDefaultLiveSessionState())
}
