import { useValue } from '@legendapp/state/react'
import {
  type PointerEvent as ReactPointerEvent,
  type RefObject,
  useCallback,
  useState,
} from 'react'

import type { GitDiffResponse } from '../../../../shared/ipc/contracts'
import { useRootStore, useSessionStore, useUIStore } from '../../state/root/store-provider'
import { GitDiffPanel } from './GitDiffPanel'

interface GitDiffPanelConnectedProps {
  onResizeStart: (event: ReactPointerEvent<HTMLDivElement>) => void
  panelRef: RefObject<HTMLElement | null>
}

export function GitDiffPanelConnected({ onResizeStart, panelRef }: GitDiffPanelConnectedProps) {
  const rootStore = useRootStore()
  const sessionStore = useSessionStore()
  const uiStore = useUIStore()
  const [diff, setDiff] = useState<GitDiffResponse | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [isActionRunning, setIsActionRunning] = useState(false)
  const { selectedSessionId, selectedSessionTitle, width } = useValue(() => ({
    selectedSessionId: sessionStore.selectedSession?.id ?? null,
    selectedSessionTitle: sessionStore.selectedSession?.title ?? null,
    width: uiStore.state$.contextPanelWidth.get(),
  }))

  const refresh = useCallback(() => {
    if (!selectedSessionId || !rootStore.api.git.getDiff) {
      return
    }

    setIsLoading(true)
    setError(null)
    void rootStore.api.git
      .getDiff({ sessionId: selectedSessionId })
      .then((result) => setDiff(result))
      .catch((nextError) =>
        setError(nextError instanceof Error ? nextError.message : 'Unknown error'),
      )
      .finally(() => setIsLoading(false))
  }, [rootStore.api.git, selectedSessionId])

  const runAction = useCallback(
    (action: () => Promise<unknown>) => {
      setIsActionRunning(true)
      setError(null)
      void action()
        .then(() => {
          refresh()
        })
        .catch((nextError) =>
          setError(nextError instanceof Error ? nextError.message : 'Unknown error'),
        )
        .finally(() => setIsActionRunning(false))
    },
    [refresh],
  )

  const handleCommit = useCallback(() => {
    if (!selectedSessionId || !rootStore.api.git.commit) {
      return
    }

    runAction(
      () =>
        rootStore.api.git.commit?.({
          sessionId: selectedSessionId,
          message: selectedSessionTitle
            ? `Update ${selectedSessionTitle}`
            : 'Update session changes',
        }) ?? Promise.resolve(),
    )
  }, [rootStore.api.git, runAction, selectedSessionId, selectedSessionTitle])

  const handlePush = useCallback(() => {
    if (!selectedSessionId || !rootStore.api.git.push) {
      return
    }

    runAction(() => rootStore.api.git.push?.({ sessionId: selectedSessionId }) ?? Promise.resolve())
  }, [rootStore.api.git, runAction, selectedSessionId])

  const handleCreatePullRequest = useCallback(() => {
    if (!selectedSessionId || !rootStore.api.git.createPullRequest) {
      return
    }

    runAction(
      () =>
        rootStore.api.git.createPullRequest?.({
          sessionId: selectedSessionId,
          title: selectedSessionTitle ?? 'Session changes',
          baseBranch: diff?.success ? diff.data.baseBranch : 'main',
        }) ?? Promise.resolve(),
    )
  }, [diff, rootStore.api.git, runAction, selectedSessionId, selectedSessionTitle])

  return (
    <GitDiffPanel
      diff={diff}
      error={error}
      isActionRunning={isActionRunning}
      isLoading={isLoading}
      panelRef={panelRef}
      selectedSessionId={selectedSessionId}
      width={width}
      onCommit={handleCommit}
      onCreatePullRequest={handleCreatePullRequest}
      onPush={handlePush}
      onRefresh={refresh}
      onResizeStart={onResizeStart}
    />
  )
}
