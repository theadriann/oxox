// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { LiveSessionAskUserAnswerRecord, OxoxBridge } from '../../../../shared/ipc/contracts'
import { PermissionResolutionStore } from '../PermissionResolutionStore'

function createSessionApi(overrides: Partial<OxoxBridge['session']> = {}) {
  return {
    resolvePermissionRequest: vi.fn().mockResolvedValue(undefined),
    resolveAskUser: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  }
}

describe('PermissionResolutionStore', () => {
  beforeEach(() => {
    window.localStorage.clear()
  })

  it('resolves a permission request and tracks pending state', async () => {
    let resolveCall: (() => void) | null = null
    const resolvePermissionRequest = vi.fn().mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          resolveCall = resolve
        }),
    )
    const onRefreshSnapshot = vi.fn().mockResolvedValue(undefined)
    const store = new PermissionResolutionStore(
      () => ({ sessionId: 'session-alpha' }) as any,
      createSessionApi({ resolvePermissionRequest }),
      onRefreshSnapshot,
    )

    const promise = store.resolvePermission('perm-1', 'approve')

    expect(store.pendingPermissionRequestIds).toEqual(['perm-1'])

    resolveCall!()
    await promise

    expect(resolvePermissionRequest).toHaveBeenCalledWith('session-alpha', 'perm-1', 'approve')
    expect(store.pendingPermissionRequestIds).toEqual([])
    expect(onRefreshSnapshot).toHaveBeenCalledWith('session-alpha')
  })

  it('resolves an ask-user request and tracks pending state', async () => {
    let resolveCall: (() => void) | null = null
    const resolveAskUser = vi.fn().mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          resolveCall = resolve
        }),
    )
    const answers: LiveSessionAskUserAnswerRecord[] = [{ index: 0, question: 'Q?', answer: 'A' }]
    const onRefreshSnapshot = vi.fn().mockResolvedValue(undefined)
    const store = new PermissionResolutionStore(
      () => ({ sessionId: 'session-alpha' }) as any,
      createSessionApi({ resolveAskUser }),
      onRefreshSnapshot,
    )

    const promise = store.resolveAskUser('ask-1', answers)

    expect(store.pendingAskUserRequestIds).toEqual(['ask-1'])

    resolveCall!()
    await promise

    expect(resolveAskUser).toHaveBeenCalledWith('session-alpha', 'ask-1', answers)
    expect(store.pendingAskUserRequestIds).toEqual([])
  })

  it('surfaces errors from permission resolution', async () => {
    const resolvePermissionRequest = vi.fn().mockRejectedValue(new Error('Denied'))
    const store = new PermissionResolutionStore(
      () => ({ sessionId: 'session-alpha' }) as any,
      createSessionApi({ resolvePermissionRequest }),
    )

    await store.resolvePermission('perm-1', 'approve')

    expect(store.error).toBe('Denied')
    expect(store.pendingPermissionRequestIds).toEqual([])
  })

  it('no-ops when there is no selected snapshot', async () => {
    const resolvePermissionRequest = vi.fn()
    const store = new PermissionResolutionStore(
      () => null,
      createSessionApi({ resolvePermissionRequest }),
    )

    await store.resolvePermission('perm-1', 'approve')

    expect(resolvePermissionRequest).not.toHaveBeenCalled()
  })
})
