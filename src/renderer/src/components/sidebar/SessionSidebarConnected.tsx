import { useRef } from 'react'

import { useMountEffect } from '../../hooks/useMountEffect'
import { SessionSidebar, type SessionSidebarProps } from './SessionSidebar'
import { SessionSidebarStore } from './SessionSidebarStore'

interface SessionSidebarConnectedProps extends SessionSidebarProps {
  store?: SessionSidebarStore
}

export function SessionSidebarConnected({ store, ...props }: SessionSidebarConnectedProps) {
  const storeRef = useRef(store ?? new SessionSidebarStore())
  const resolvedStore = storeRef.current

  useMountEffect(() => {
    const timer = window.setInterval(() => resolvedStore.tickNow(), 60_000)
    return () => window.clearInterval(timer)
  })

  return <SessionSidebar {...props} store={resolvedStore} />
}
