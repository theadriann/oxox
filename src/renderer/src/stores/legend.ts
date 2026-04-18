export type { Observable } from '@legendapp/state'
export { batch, observable, observe } from '@legendapp/state'
export { observer, useObserveEffect, useValue } from '@legendapp/state/react'

type ObservableLike<T> = {
  get?: () => T
  set?: (value: T) => void
  peek?: () => T
}

function isObservableLike<T>(value: unknown): value is ObservableLike<T> {
  return Boolean(
    value &&
      typeof value === 'object' &&
      typeof (value as ObservableLike<T>).peek === 'function' &&
      typeof (value as ObservableLike<T>).get === 'function',
  )
}

export function readValue<T>(value: T | ObservableLike<T>): T {
  return isObservableLike<T>(value) ? value.get?.() : (value as T)
}

export function readField<TState extends object, TKey extends keyof TState>(
  state: TState | ObservableLike<TState>,
  key: TKey,
): TState[TKey] {
  const child = (state as TState & Record<TKey, ObservableLike<TState[TKey]>>)[key]

  if (isObservableLike<TState[TKey]>(child)) {
    return child.get?.() as TState[TKey]
  }

  if (isObservableLike<TState>(state)) {
    return state.get?.()[key] as TState[TKey]
  }

  return (state as TState)[key]
}

export function writeField<TState extends object, TKey extends keyof TState>(
  state: TState | ObservableLike<TState>,
  key: TKey,
  value: TState[TKey],
): void {
  const child = (state as TState & Record<TKey, ObservableLike<TState[TKey]>>)[key]

  if (isObservableLike<TState[TKey]>(child) && typeof child.set === 'function') {
    child.set?.(value)
    return
  }

  if (isObservableLike<TState>(state) && typeof state.set === 'function') {
    state.set?.({
      ...state.get?.(),
      [key]: value,
    })
    return
  }

  ;(state as TState)[key] = value
}

export function readMapValue<TKey, TValue>(map: Map<TKey, TValue>, key: TKey): TValue | undefined {
  const value = map.get(key as TKey) as TValue | ObservableLike<TValue> | undefined

  return isObservableLike<TValue>(value) ? value.get?.() : (value as TValue | undefined)
}

export function writeMapValue<TKey, TValue>(
  map: Map<TKey, TValue>,
  key: TKey,
  value: TValue,
): void {
  const current = map.get(key as TKey) as TValue | ObservableLike<TValue> | undefined

  if (isObservableLike<TValue>(current) && typeof current.set === 'function') {
    current.set?.(value)
    return
  }

  map.set(key, value)
}

export function bindMethods<T extends object>(instance: T): void {
  const prototype = Object.getPrototypeOf(instance)

  for (const key of Object.getOwnPropertyNames(prototype)) {
    if (key === 'constructor') {
      continue
    }

    const descriptor = Object.getOwnPropertyDescriptor(prototype, key)

    if (!descriptor || typeof descriptor.value !== 'function') {
      continue
    }

    Object.defineProperty(instance, key, {
      configurable: true,
      enumerable: false,
      value: descriptor.value.bind(instance),
      writable: true,
    })
  }
}
