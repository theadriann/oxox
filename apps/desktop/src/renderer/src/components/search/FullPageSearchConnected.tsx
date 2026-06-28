import { useValue } from '@legendapp/state/react'

import { useRootStore, useSessionStore, useUIStore } from '../../state/root/store-provider'
import { useAppShellControllerContext } from '../app-shell/AppShellControllerContext'
import { FullPageSearch } from './FullPageSearch'

export function FullPageSearchConnected() {
  const rootStore = useRootStore()
  const sessionStore = useSessionStore()
  const uiStore = useUIStore()
  const { handleSelectSession } = useAppShellControllerContext()
  const sessions = useValue(sessionStore.state$.sessions)

  return (
    <FullPageSearch
      getSessionTranscript={rootStore.api.transcript.getSessionTranscript}
      sessions={sessions}
      searchSessions={rootStore.api.search.sessions}
      onSelectSession={(sessionId, target) => {
        uiStore.closeSearch()
        handleSelectSession(sessionId, target)
      }}
    />
  )
}
