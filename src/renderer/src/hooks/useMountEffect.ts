import { useEffect } from 'react'

/**
 * Run an effect exactly once on mount. Wraps useEffect with an empty
 * dependency array so that the intent is explicit and lint-safe.
 */
export function useMountEffect(effect: () => undefined | (() => void)): void {
  // biome-ignore lint/correctness/useExhaustiveDependencies: mount-only by design
  useEffect(effect, [])
}
