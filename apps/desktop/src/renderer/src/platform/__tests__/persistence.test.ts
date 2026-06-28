// @vitest-environment jsdom

import { beforeEach, describe, expect, it } from 'vitest'

import { createLocalStoragePort, createMemoryPersistencePort } from '../persistence'

describe('persistence ports', () => {
  beforeEach(() => {
    window.localStorage.clear()
  })

  it('reads fallback values when local storage is empty', () => {
    const port = createLocalStoragePort()

    expect(port.get('missing', { ok: true })).toEqual({ ok: true })
  })

  it('writes and reads typed values through local storage', () => {
    const port = createLocalStoragePort()

    port.set('prefs', { modelId: 'gpt-5.4', interactionMode: 'spec' })

    expect(port.get('prefs', null)).toEqual({
      modelId: 'gpt-5.4',
      interactionMode: 'spec',
    })
  })

  it('removes values', () => {
    const port = createLocalStoragePort()
    port.set('prefs', { ok: true })

    port.remove('prefs')

    expect(port.get('prefs', null)).toBeNull()
  })

  it('isolates values in memory persistence port', () => {
    const port = createMemoryPersistencePort()

    port.set('prefs', { ok: true })

    expect(port.get('prefs', null)).toEqual({ ok: true })
    port.remove('prefs')
    expect(port.get('prefs', 'fallback')).toBe('fallback')
  })
})
