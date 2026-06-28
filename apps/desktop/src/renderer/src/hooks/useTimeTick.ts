import { useSyncExternalStore } from 'react'

type Listener = () => void

class TimeTickStore {
  now = Date.now()
  timer: number | null = null
  listeners = new Set<Listener>()

  constructor(private readonly intervalMs: number) {}

  subscribe = (listener: Listener): (() => void) => {
    this.listeners.add(listener)

    if (this.listeners.size === 1) {
      this.now = Date.now()
    }

    this.ensureTimer()

    return () => {
      this.listeners.delete(listener)

      if (this.listeners.size === 0 && this.timer !== null) {
        window.clearInterval(this.timer)
        this.timer = null
      }
    }
  }

  getSnapshot = (): number => {
    return this.now
  }

  private ensureTimer(): void {
    if (this.timer !== null) {
      return
    }

    this.timer = window.setInterval(() => {
      this.now = Date.now()

      for (const listener of this.listeners) {
        listener()
      }
    }, this.intervalMs)
  }
}

const timeTickStores = new Map<number, TimeTickStore>()

function getTimeTickStore(intervalMs: number): TimeTickStore {
  const existingStore = timeTickStores.get(intervalMs)

  if (existingStore) {
    return existingStore
  }

  const store = new TimeTickStore(intervalMs)
  timeTickStores.set(intervalMs, store)
  return store
}

export function useTimeTick(intervalMs = 1_000): number {
  const store = getTimeTickStore(intervalMs)
  return useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot)
}
