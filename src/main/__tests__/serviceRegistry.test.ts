import { describe, expect, it, vi } from 'vitest'

import { ServiceRegistry } from '../app/ServiceRegistry'

describe('ServiceRegistry', () => {
  it('registers and resolves services by key', () => {
    const registry = new ServiceRegistry()
    const foundation = { kind: 'foundation' }

    registry.register('foundation', foundation)

    expect(registry.has('foundation')).toBe(true)
    expect(registry.get('foundation')).toBe(foundation)
    expect(registry.getOrThrow<typeof foundation>('foundation')).toBe(foundation)
  })

  it('disposes registered services in reverse order when cleared', () => {
    const registry = new ServiceRegistry()
    const firstDispose = vi.fn()
    const secondClose = vi.fn()

    registry.register('first', { dispose: firstDispose })
    registry.register('second', { close: secondClose })

    registry.disposeAll()

    expect(secondClose).toHaveBeenCalledTimes(1)
    expect(firstDispose).toHaveBeenCalledTimes(1)
    expect(registry.has('first')).toBe(false)
    expect(registry.has('second')).toBe(false)
  })
})
