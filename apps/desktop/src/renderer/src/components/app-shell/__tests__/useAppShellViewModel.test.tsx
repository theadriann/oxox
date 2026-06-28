// @vitest-environment jsdom

import { act, render } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { useAppShellViewModel } from '../useAppShellViewModel'

function ViewModelProbe({
  resultRef,
  props,
}: {
  resultRef: { current: ReturnType<typeof useAppShellViewModel> | null }
  props: Parameters<typeof useAppShellViewModel>[0]
}) {
  resultRef.current = useAppShellViewModel(props)
  return null
}

describe('useAppShellViewModel', () => {
  it('derives top-bar labels, detail-view key, animation mode, and composer visibility from app-shell state', () => {
    const resultRef = { current: null as ReturnType<typeof useAppShellViewModel> | null }

    render(
      <ViewModelProbe
        resultRef={resultRef}
        props={
          {
            foundationStore: {
              hasError: false,
              isDroidMissing: false,
              isLoading: false,
              refresh: vi.fn(),
            },
            liveSessionStore: {
              selectedSnapshot: {
                title: 'Live session title',
                projectWorkspacePath: '/tmp/live-project',
              },
              selectedSnapshotId: 'session-live-1',
            },
            newSessionForm: {
              path: '/tmp/new-project',
              showForm: false,
            },
            prefersReducedMotion: false,
            sessionStore: {
              hasDeletedSelection: false,
              selectedSession: {
                projectLabel: 'Indexed project',
                status: 'completed',
                title: 'Indexed session title',
              },
              selectedSessionId: 'session-1',
              sessions: [{ id: 'session-1' }],
            },
          } as never
        }
      />,
    )

    expect(resultRef.current).toMatchObject({
      canComposeDetached: true,
      detailViewKey: 'detail:live:session-live-1',
      sessionProjectLabel: '/tmp/live-project',
      sessionTitle: 'Live session title',
      shouldAnimate: false,
      shouldRenderComposer: true,
    })
  })

  it('builds sidebar retry state and new-session labels when foundation loading fails', async () => {
    const refresh = vi.fn().mockResolvedValue(undefined)
    const resultRef = { current: null as ReturnType<typeof useAppShellViewModel> | null }

    render(
      <ViewModelProbe
        resultRef={resultRef}
        props={
          {
            foundationStore: {
              hasError: true,
              isDroidMissing: false,
              isLoading: false,
              refresh,
            },
            liveSessionStore: {
              selectedSnapshot: null,
              selectedSnapshotId: null,
            },
            newSessionForm: {
              path: '/tmp/new-project',
              showForm: true,
            },
            prefersReducedMotion: true,
            sessionStore: {
              hasDeletedSelection: false,
              selectedSession: null,
              selectedSessionId: '',
              sessions: [],
            },
          } as never
        }
      />,
    )

    expect(resultRef.current?.shouldAnimate).toBe(false)
    expect(resultRef.current?.detailViewKey).toBe('detail:foundation-error')
    expect(resultRef.current?.sessionTitle).toBe('New session')
    expect(resultRef.current?.sessionProjectLabel).toBe('/tmp/new-project')
    expect(resultRef.current?.shouldRenderComposer).toBe(true)
    expect(resultRef.current?.sidebarErrorState?.actionLabel).toBe('Retry loading sessions')

    await act(async () => {
      resultRef.current?.sidebarErrorState?.onAction()
      await Promise.resolve()
    })

    expect(refresh).toHaveBeenCalledTimes(1)
  })

  it('updates sidebar retry state when foundation error status changes after the first render', () => {
    const refresh = vi.fn().mockResolvedValue(undefined)
    const foundationStore = {
      hasError: false,
      isDroidMissing: false,
      isLoading: false,
      refresh,
    }
    const resultRef = { current: null as ReturnType<typeof useAppShellViewModel> | null }
    const props = {
      foundationStore,
      liveSessionStore: {
        selectedSnapshot: null,
        selectedSnapshotId: null,
      },
      newSessionForm: {
        path: '',
        showForm: false,
      },
      prefersReducedMotion: false,
      sessionStore: {
        hasDeletedSelection: false,
        selectedSession: null,
        selectedSessionId: '',
        sessions: [],
      },
    } as never

    const { rerender } = render(<ViewModelProbe resultRef={resultRef} props={props} />)

    expect(resultRef.current?.sidebarErrorState).toBeUndefined()

    foundationStore.hasError = true

    rerender(<ViewModelProbe resultRef={resultRef} props={props} />)

    expect(resultRef.current?.detailViewKey).toBe('detail:foundation-error')
    expect(resultRef.current?.sidebarErrorState?.actionLabel).toBe('Retry loading sessions')
  })
})
