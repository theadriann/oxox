import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  clearActiveSessions,
  detachActiveSessions,
  registerActiveSession,
} from '../integration/sessionRegistry'

describe('sessionRegistry', () => {
  afterEach(() => {
    clearActiveSessions()
  })

  it('detaches every registered session during graceful quit', async () => {
    const firstDetach = vi.fn()
    const secondDetach = vi.fn().mockResolvedValue(undefined)

    registerActiveSession({ detach: firstDetach })
    registerActiveSession({ detach: secondDetach })

    await detachActiveSessions()

    expect(firstDetach).toHaveBeenCalledOnce()
    expect(secondDetach).toHaveBeenCalledOnce()
  })

  it('supports unregistering active sessions', async () => {
    const detach = vi.fn()
    const unregister = registerActiveSession({ detach })

    unregister()
    await detachActiveSessions()

    expect(detach).not.toHaveBeenCalled()
  })
})
