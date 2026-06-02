import { useValue } from '@legendapp/state/react'
import { useState } from 'react'
import type { SessionSearchIndexingProgress } from '../../../../shared/ipc/contracts'
import { useMountEffect } from '../../hooks/useMountEffect'
import {
  useFoundationStore,
  useRootStore,
  useSessionStore,
  useUpdateStore,
} from '../../state/root/store-provider'
import { StatusBar } from '../status-bar/StatusBar'
import { buildStatusBarProps } from './connectedSelectors'

const SEARCH_INDEXING_PROGRESS_POLL_MS = 1_000

export function StatusBarConnected() {
  const foundationStore = useFoundationStore()
  const rootStore = useRootStore()
  const sessionStore = useSessionStore()
  const updateStore = useUpdateStore()
  const [searchIndexingProgress, setSearchIndexingProgress] =
    useState<SessionSearchIndexingProgress | null>(null)
  const props = useValue(() =>
    buildStatusBarProps({
      foundationStore,
      updateStore,
      sessionStore,
    }),
  )

  useMountEffect(() => {
    const getProgress = rootStore.api.search.indexingProgress

    if (!getProgress) {
      return
    }

    let disposed = false
    const refresh = async () => {
      const progress = await getProgress().catch(() => null)

      if (!disposed && progress) {
        setSearchIndexingProgress(progress)
      }
    }
    void refresh()
    const timer = window.setInterval(() => void refresh(), SEARCH_INDEXING_PROGRESS_POLL_MS)

    return () => {
      disposed = true
      window.clearInterval(timer)
    }
  })

  return <StatusBar {...props} searchIndexingProgress={searchIndexingProgress} />
}
