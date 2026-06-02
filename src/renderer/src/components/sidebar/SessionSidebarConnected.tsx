import { useValue } from '@legendapp/state/react'
import { useRef } from 'react'
import { useMountEffect } from '../../hooks/useMountEffect'
import {
  type SearchSessionsGateway,
  SessionSearchController,
} from '../../state/workflows/session-search/session-search.model'
import { SessionSidebar, type SessionSidebarProps } from './SessionSidebar'
import { SessionSidebarStore } from './SessionSidebarStore'

interface SessionSidebarConnectedProps extends SessionSidebarProps {
  store?: SessionSidebarStore
  searchSessions?: SearchSessionsGateway
}

export function SessionSidebarConnected({
  store,
  searchSessions,
  onSearchQueryChange,
  ...props
}: SessionSidebarConnectedProps) {
  const storeRef = useRef(store ?? new SessionSidebarStore())
  const resolvedStore = storeRef.current
  const searchControllerRef = useRef(new SessionSearchController(searchSessions))
  const searchController = searchControllerRef.current
  const searchMatches = useValue(() => (searchSessions ? searchController.matches : null))

  const handleSearchQueryChange = (query: string) => {
    onSearchQueryChange?.(query)
    searchController.scheduleSearch(query)
  }

  useMountEffect(() => {
    const timer = window.setInterval(() => resolvedStore.tickNow(), 60_000)
    return () => {
      window.clearInterval(timer)
      searchController.dispose()
    }
  })

  return (
    <SessionSidebar
      {...props}
      store={resolvedStore}
      searchMatches={searchMatches}
      onSearchQueryChange={handleSearchQueryChange}
    />
  )
}
