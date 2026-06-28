// @vitest-environment jsdom

import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import type { LiveSessionRewindInfo } from '../../../../../shared/ipc/contracts'
import { SessionRewindDialog } from '../SessionRewindDialog'

function createRewindInfo(overrides: Partial<LiveSessionRewindInfo> = {}): LiveSessionRewindInfo {
  return {
    availableFiles: [
      {
        filePath: '/tmp/project/src/index.ts',
        contentHash: 'hash-1',
        size: 42,
      },
    ],
    createdFiles: [{ filePath: '/tmp/project/src/new-file.ts' }],
    evictedFiles: [{ filePath: '/tmp/project/src/old-file.ts', reason: 'Too old to restore' }],
    ...overrides,
  }
}

describe('SessionRewindDialog', () => {
  it('selects a message (auto-loading rewind info) and submits the rewind', () => {
    class ResizeObserverMock {
      observe() {}
      unobserve() {}
      disconnect() {}
    }

    vi.stubGlobal('ResizeObserver', ResizeObserverMock)
    Element.prototype.scrollIntoView = vi.fn()

    const onMessageIdChange = vi.fn()
    const onForkTitleChange = vi.fn()
    const onOpenChange = vi.fn()
    const onRefreshInfo = vi.fn()
    const onToggleRestoreFile = vi.fn()
    const onToggleDeleteFile = vi.fn()
    const onSubmit = vi.fn()

    const { rerender } = render(
      <SessionRewindDialog
        open={true}
        messageOptions={[
          {
            value: 'message-1',
            label: 'User · Plan the migration',
          },
        ]}
        selectedMessageId=""
        forkTitle="Rewinded session"
        rewindInfo={null}
        selectedRestoreFilePaths={[]}
        selectedDeleteFilePaths={[]}
        isLoadingInfo={false}
        isExecuting={false}
        error={null}
        onMessageIdChange={onMessageIdChange}
        onForkTitleChange={onForkTitleChange}
        onOpenChange={onOpenChange}
        onRefreshInfo={onRefreshInfo}
        onToggleRestoreFile={onToggleRestoreFile}
        onToggleDeleteFile={onToggleDeleteFile}
        onSubmit={onSubmit}
      />,
    )

    fireEvent.click(screen.getByText('User · Plan the migration'))

    expect(onMessageIdChange).toHaveBeenCalledWith('message-1')
    expect(onRefreshInfo).toHaveBeenCalledTimes(1)

    rerender(
      <SessionRewindDialog
        open={true}
        messageOptions={[
          {
            value: 'message-1',
            label: 'User · Plan the migration',
          },
        ]}
        selectedMessageId="message-1"
        forkTitle="Rewinded session"
        rewindInfo={createRewindInfo()}
        selectedRestoreFilePaths={['/tmp/project/src/index.ts']}
        selectedDeleteFilePaths={['/tmp/project/src/new-file.ts']}
        isLoadingInfo={false}
        isExecuting={false}
        error={null}
        onMessageIdChange={onMessageIdChange}
        onForkTitleChange={onForkTitleChange}
        onOpenChange={onOpenChange}
        onRefreshInfo={onRefreshInfo}
        onToggleRestoreFile={onToggleRestoreFile}
        onToggleDeleteFile={onToggleDeleteFile}
        onSubmit={onSubmit}
      />,
    )

    screen.getByLabelText('Fork title')

    fireEvent.change(screen.getByLabelText('Fork title'), {
      target: { value: 'Rewinded session v2' },
    })
    expect(onForkTitleChange).toHaveBeenCalledWith('Rewinded session v2')

    fireEvent.click(screen.getByLabelText('/tmp/project/src/index.ts'))
    expect(onToggleRestoreFile).toHaveBeenCalledWith('/tmp/project/src/index.ts')

    fireEvent.click(screen.getByLabelText('/tmp/project/src/new-file.ts'))
    expect(onToggleDeleteFile).toHaveBeenCalledWith('/tmp/project/src/new-file.ts')

    fireEvent.click(screen.getByRole('button', { name: /Execute rewind/i }))
    expect(onSubmit).toHaveBeenCalledTimes(1)
  })
})
