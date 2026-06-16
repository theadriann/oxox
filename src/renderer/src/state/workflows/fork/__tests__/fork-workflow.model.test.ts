// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { LiveSessionSnapshot, OxoxBridge } from '../../../../../../shared/ipc/contracts'
import { AsyncActionsStore } from '../../../composer/async-actions.model'
import { ForkWorkflowStore } from '../fork-workflow.model'

function createSnapshot(overrides: Partial<LiveSessionSnapshot> = {}): LiveSessionSnapshot {
  return {
    sessionId: 'session-fork',
    title: 'Forked session',
    status: 'active',
    transport: 'stream-jsonrpc',
    processId: 42,
    viewerCount: 1,
    projectWorkspacePath: '/tmp/project',
    parentSessionId: 'session-alpha',
    availableModels: [],
    settings: {},
    messages: [],
    events: [],
    ...overrides,
  }
}

function createSessionApi(overrides: Partial<OxoxBridge['session']> = {}) {
  return {
    fork: vi.fn().mockResolvedValue(createSnapshot()),
    forkViaDaemon: vi.fn().mockResolvedValue(createSnapshot({ sessionId: 'session-daemon-fork' })),
    ...overrides,
  }
}

function createForkWorkflowStore({
  api = createSessionApi(),
  onForked,
  selectedSessionId = 'session-alpha',
  title = 'Alpha session',
}: {
  api?: Partial<OxoxBridge['session']>
  onForked?: (snapshot: LiveSessionSnapshot) => Promise<void>
  selectedSessionId?: string | null
  title?: string | null
} = {}) {
  const asyncActionsStore = new AsyncActionsStore()
  const store = new ForkWorkflowStore(
    () => selectedSessionId,
    () => (title ? { title } : null),
    api,
    asyncActionsStore,
    onForked,
  )

  return { asyncActionsStore, store }
}

describe('ForkWorkflowStore', () => {
  beforeEach(() => {
    window.localStorage.clear()
  })

  it('opens with a default fork title and closes', () => {
    const { store } = createForkWorkflowStore()

    store.openForkDialog()

    expect(store.isForkDialogOpen).toBe(true)
    expect(store.forkDraft).toBe('[Fork] Alpha session')

    store.closeForkDialog()

    expect(store.isForkDialogOpen).toBe(false)
    expect(store.forkDraft).toBe('')
  })

  it('does not open dialog when no session is selected', () => {
    const { store } = createForkWorkflowStore({ selectedSessionId: null, title: null })

    store.openForkDialog()

    expect(store.isForkDialogOpen).toBe(false)
  })

  it('submits the edited fork title through the primary fork api', async () => {
    const snapshot = createSnapshot({ title: '[Fork] Custom title' })
    const fork = vi.fn().mockResolvedValue(snapshot)
    const forkViaDaemon = vi.fn().mockResolvedValue(createSnapshot())
    const onForked = vi.fn().mockResolvedValue(undefined)
    const { asyncActionsStore, store } = createForkWorkflowStore({
      api: createSessionApi({ fork, forkViaDaemon }),
      onForked,
    })

    store.openForkDialog()
    store.setForkDraft(' [Fork] Custom title ')
    await store.submitFork()

    expect(fork).toHaveBeenCalledWith('session-alpha', '[Fork] Custom title')
    expect(forkViaDaemon).not.toHaveBeenCalled()
    expect(onForked).toHaveBeenCalledWith(snapshot)
    expect(store.isForkDialogOpen).toBe(false)
    expect(store.forkingSessionId).toBeNull()
    expect(asyncActionsStore.actions[0]).toMatchObject({
      title: 'Fork created',
      description: '[Fork] Custom title',
      status: 'success',
    })
  })

  it('closes the dialog immediately while the fork continues in the background', async () => {
    let resolveFork!: (snapshot: LiveSessionSnapshot) => void
    const fork = vi.fn(
      () =>
        new Promise<LiveSessionSnapshot>((resolve) => {
          resolveFork = resolve
        }),
    )
    const { asyncActionsStore, store } = createForkWorkflowStore({
      api: createSessionApi({ fork }),
    })

    store.openForkDialog()
    const submitPromise = store.submitFork()

    expect(store.isForkDialogOpen).toBe(false)
    expect(asyncActionsStore.actions[0]).toMatchObject({
      title: 'Creating fork',
      description: '[Fork] Alpha session',
      status: 'running',
    })

    resolveFork(createSnapshot({ title: '[Fork] Alpha session' }))
    await submitPromise

    expect(asyncActionsStore.actions[0]).toMatchObject({
      title: 'Fork created',
      status: 'success',
    })
  })

  it('falls back to the daemon fork api', async () => {
    const forkViaDaemon = vi.fn().mockResolvedValue(createSnapshot())
    const { store } = createForkWorkflowStore({
      api: createSessionApi({ fork: undefined, forkViaDaemon }),
    })

    store.openForkDialog()
    await store.submitFork()

    expect(forkViaDaemon).toHaveBeenCalledWith('session-alpha', '[Fork] Alpha session')
  })

  it('surfaces errors from the fork call', async () => {
    const fork = vi.fn().mockRejectedValue(new Error('Fork failed'))
    const { asyncActionsStore, store } = createForkWorkflowStore({
      api: createSessionApi({ fork }),
    })

    store.openForkDialog()
    await store.submitFork()

    expect(store.error).toBe('Fork failed')
    expect(store.forkingSessionId).toBeNull()
    expect(asyncActionsStore.actions[0]).toMatchObject({
      title: 'Fork failed',
      description: 'Fork failed',
      status: 'error',
    })
  })
})
