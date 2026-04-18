// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { OxoxBridge } from '../../../../shared/ipc/contracts'
import { RenameWorkflowStore } from '../RenameWorkflowStore'

function createSessionApi(overrides: Partial<OxoxBridge['session']> = {}) {
  return {
    rename: vi.fn().mockResolvedValue(undefined),
    renameViaDaemon: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  }
}

describe('RenameWorkflowStore', () => {
  beforeEach(() => {
    window.localStorage.clear()
  })

  it('opens and closes the rename dialog', () => {
    const store = new RenameWorkflowStore(
      () => 'session-alpha',
      () => ({ title: 'Alpha session' }),
      createSessionApi(),
    )

    store.openRenameDialog()

    expect(store.isRenameDialogOpen).toBe(true)
    expect(store.renameDraft).toBe('Alpha session')

    store.closeRenameDialog()

    expect(store.isRenameDialogOpen).toBe(false)
    expect(store.renameDraft).toBe('')
  })

  it('does not open dialog when no session is selected', () => {
    const store = new RenameWorkflowStore(
      () => null,
      () => null,
      createSessionApi(),
    )

    store.openRenameDialog()

    expect(store.isRenameDialogOpen).toBe(false)
  })

  it('prefers the live session rename api when available', async () => {
    const rename = vi.fn().mockResolvedValue(undefined)
    const renameViaDaemon = vi.fn().mockResolvedValue(undefined)
    const onRenamed = vi.fn().mockResolvedValue(undefined)
    const store = new RenameWorkflowStore(
      () => 'session-alpha',
      () => ({ title: 'Alpha session' }),
      createSessionApi({ rename, renameViaDaemon }),
      onRenamed,
    )

    store.openRenameDialog()
    store.setRenameDraft('New name')
    await store.submitRename()

    expect(rename).toHaveBeenCalledWith('session-alpha', 'New name')
    expect(renameViaDaemon).not.toHaveBeenCalled()
    expect(onRenamed).toHaveBeenCalledWith('session-alpha', 'New name')
    expect(store.isRenameDialogOpen).toBe(false)
    expect(store.renamingSessionId).toBeNull()
  })

  it('falls back to the daemon rename api', async () => {
    const renameViaDaemon = vi.fn().mockResolvedValue(undefined)
    const onRenamed = vi.fn().mockResolvedValue(undefined)
    const store = new RenameWorkflowStore(
      () => 'session-alpha',
      () => ({ title: 'Alpha session' }),
      createSessionApi({ rename: undefined, renameViaDaemon }),
      onRenamed,
    )

    store.openRenameDialog()
    store.setRenameDraft('New name')
    await store.submitRename()

    expect(renameViaDaemon).toHaveBeenCalledWith('session-alpha', 'New name')
    expect(onRenamed).toHaveBeenCalledWith('session-alpha', 'New name')
    expect(store.isRenameDialogOpen).toBe(false)
    expect(store.renamingSessionId).toBeNull()
  })

  it('surfaces errors from the rename call', async () => {
    const renameViaDaemon = vi.fn().mockRejectedValue(new Error('Rename failed'))
    const store = new RenameWorkflowStore(
      () => 'session-alpha',
      () => ({ title: 'Alpha' }),
      createSessionApi({ rename: undefined, renameViaDaemon }),
    )

    store.openRenameDialog()
    store.setRenameDraft('New')
    await store.submitRename()

    expect(store.error).toBe('Rename failed')
    expect(store.renamingSessionId).toBeNull()
  })
})
