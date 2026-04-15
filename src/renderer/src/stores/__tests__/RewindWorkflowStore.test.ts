// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { LiveSessionRewindInfo, OxoxBridge } from '../../../../shared/ipc/contracts'
import { RewindWorkflowStore } from '../RewindWorkflowStore'

function createRewindInfo(overrides: Partial<LiveSessionRewindInfo> = {}): LiveSessionRewindInfo {
  return {
    availableFiles: [{ filePath: '/tmp/src/index.ts', contentHash: 'hash-1', size: 128 }],
    createdFiles: [{ filePath: '/tmp/src/new-file.ts' }],
    evictedFiles: [],
    ...overrides,
  }
}

function createSessionApi(overrides: Partial<OxoxBridge['session']> = {}) {
  return {
    getRewindInfo: vi.fn().mockResolvedValue(createRewindInfo()),
    executeRewind: vi.fn().mockResolvedValue({
      snapshot: { sessionId: 'session-rewound', title: 'Rewound' },
      restoredCount: 1,
      deletedCount: 0,
      failedRestoreCount: 0,
      failedDeleteCount: 0,
    }),
    ...overrides,
  }
}

describe('RewindWorkflowStore', () => {
  beforeEach(() => {
    window.localStorage.clear()
  })

  it('opens and closes the rewind dialog, resetting state', () => {
    const store = new RewindWorkflowStore(
      () => 'session-alpha',
      () => ({ title: 'Alpha' }),
      createSessionApi(),
    )

    store.openRewindDialog()

    expect(store.isRewindDialogOpen).toBe(true)
    expect(store.rewindForkTitle).toBe('Rewind Alpha')

    store.closeRewindDialog()

    expect(store.isRewindDialogOpen).toBe(false)
    expect(store.rewindMessageId).toBe('')
    expect(store.rewindInfo).toBeNull()
  })

  it('does not open dialog when no session is selected', () => {
    const store = new RewindWorkflowStore(
      () => null,
      () => null,
      createSessionApi(),
    )

    store.openRewindDialog()

    expect(store.isRewindDialogOpen).toBe(false)
  })

  it('loads rewind info for the selected session and message', async () => {
    const getRewindInfo = vi.fn().mockResolvedValue(createRewindInfo())
    const store = new RewindWorkflowStore(
      () => 'session-alpha',
      () => ({ title: 'Alpha' }),
      createSessionApi({ getRewindInfo }),
    )

    store.openRewindDialog()
    store.setRewindMessageId('msg-1')
    await store.loadRewindInfo()

    expect(getRewindInfo).toHaveBeenCalledWith('session-alpha', 'msg-1')
    expect(store.rewindInfo).toEqual(createRewindInfo())
    expect(store.selectedRestoreFilePaths).toEqual(['/tmp/src/index.ts'])
    expect(store.selectedDeleteFilePaths).toEqual(['/tmp/src/new-file.ts'])
    expect(store.loadingRewindSessionId).toBeNull()
  })

  it('executes rewind and calls onRewound callback', async () => {
    const executeRewind = vi.fn().mockResolvedValue({
      snapshot: { sessionId: 'session-rewound', title: 'Rewound session' },
      restoredCount: 1,
      deletedCount: 0,
      failedRestoreCount: 0,
      failedDeleteCount: 0,
    })
    const onRewound = vi.fn().mockResolvedValue(undefined)
    const store = new RewindWorkflowStore(
      () => 'session-alpha',
      () => ({ title: 'Alpha' }),
      createSessionApi({ executeRewind }),
      onRewound,
    )

    store.openRewindDialog()
    store.setRewindMessageId('msg-1')
    await store.loadRewindInfo()
    store.setRewindForkTitle('Custom title')
    await store.submitExecuteRewind()

    expect(executeRewind).toHaveBeenCalledWith(
      'session-alpha',
      expect.objectContaining({
        messageId: 'msg-1',
        forkTitle: 'Custom title',
      }),
    )
    expect(onRewound).toHaveBeenCalled()
    expect(store.isRewindDialogOpen).toBe(false)
    expect(store.rewindingSessionId).toBeNull()
  })

  it('surfaces errors from executeRewind', async () => {
    const executeRewind = vi.fn().mockRejectedValue(new Error('Rewind failed'))
    const store = new RewindWorkflowStore(
      () => 'session-alpha',
      () => ({ title: 'Alpha' }),
      createSessionApi({ executeRewind }),
    )

    store.openRewindDialog()
    store.setRewindMessageId('msg-1')
    await store.loadRewindInfo()
    await store.submitExecuteRewind()

    expect(store.rewindError).toBe('Rewind failed')
    expect(store.rewindingSessionId).toBeNull()
  })

  it('toggles restore and delete file selections', () => {
    const store = new RewindWorkflowStore(
      () => 'session-alpha',
      () => ({ title: 'Alpha' }),
      createSessionApi(),
    )

    store.toggleRewindRestoreFile('/a.ts')
    expect(store.selectedRestoreFilePaths).toEqual(['/a.ts'])

    store.toggleRewindRestoreFile('/a.ts')
    expect(store.selectedRestoreFilePaths).toEqual([])

    store.toggleRewindDeleteFile('/b.ts')
    expect(store.selectedDeleteFilePaths).toEqual(['/b.ts'])

    store.toggleRewindDeleteFile('/b.ts')
    expect(store.selectedDeleteFilePaths).toEqual([])
  })
})
