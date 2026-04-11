import type {
  FoundationBootstrap,
  FoundationRecordDelta,
  SessionRecord,
} from '../../../shared/ipc/contracts'

export interface StoreEventMap {
  'session-upsert': { record: SessionRecord }
  'sessions-hydrate': { sessions: SessionRecord[] }
  'session-changes-apply': { changes: FoundationRecordDelta<SessionRecord> }
  'foundation-hydrate': { bootstrap: FoundationBootstrap }
}

export interface StoreEventBus {
  emit<K extends keyof StoreEventMap>(type: K, payload: StoreEventMap[K]): void
  subscribe<K extends keyof StoreEventMap>(
    type: K,
    listener: (payload: StoreEventMap[K]) => void,
  ): () => void
}

type EventListener<K extends keyof StoreEventMap> = (payload: StoreEventMap[K]) => void
type ListenerMap = {
  [K in keyof StoreEventMap]?: Set<EventListener<K>>
}

export function createStoreEventBus(): StoreEventBus {
  const listeners: ListenerMap = {}

  return {
    emit(type, payload) {
      const subscribers = listeners[type]

      if (!subscribers) {
        return
      }

      for (const listener of subscribers) {
        listener(payload)
      }
    },
    subscribe(type, listener) {
      const subscribers = listeners[type] ?? new Set()
      listeners[type] = subscribers
      subscribers.add(listener)

      return () => {
        subscribers.delete(listener)

        if (subscribers.size === 0) {
          delete listeners[type]
        }
      }
    },
  }
}
