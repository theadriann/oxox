export interface PersistencePort {
  get<T>(key: string, fallback: T): T
  set<T>(key: string, value: T): void
  remove(key: string): void
}

export function createLocalStoragePort(storage: Storage | null = resolveWindowStorage()) {
  return createStorageBackedPort(storage)
}

export function createMemoryPersistencePort(
  initialState: Record<string, unknown> = {},
): PersistencePort {
  const store = new Map<string, string>(
    Object.entries(initialState).map(([key, value]) => [key, JSON.stringify(value)]),
  )

  return {
    get<T>(key: string, fallback: T): T {
      const value = store.get(key)

      if (value === undefined) {
        return fallback
      }

      try {
        return JSON.parse(value) as T
      } catch {
        return fallback
      }
    },
    set<T>(key: string, value: T): void {
      store.set(key, JSON.stringify(value))
    },
    remove(key: string): void {
      store.delete(key)
    },
  }
}

function createStorageBackedPort(storage: Storage | null): PersistencePort {
  return {
    get<T>(key: string, fallback: T): T {
      if (!storage) {
        return fallback
      }

      const value = storage.getItem(key)
      if (value === null) {
        return fallback
      }

      try {
        return JSON.parse(value) as T
      } catch {
        return fallback
      }
    },
    set<T>(key: string, value: T): void {
      storage?.setItem(key, JSON.stringify(value))
    },
    remove(key: string): void {
      storage?.removeItem(key)
    },
  }
}

function resolveWindowStorage(): Storage | null {
  if (typeof window === 'undefined') {
    return null
  }

  return window.localStorage
}
