import type { PointerEvent as ReactPointerEvent, RefObject } from 'react'

import { useValue } from '../../stores/legend'
import {
  useFoundationStore,
  useLiveSessionStore,
  useSessionStore,
  useUIStore,
} from '../../stores/StoreProvider'
import { ContextPanel } from './ContextPanel'
import { buildContextPanelProps } from './contextPanelSelectors'

interface ContextPanelConnectedProps {
  onBrowseSessions: () => void
  onResizeStart: (event: ReactPointerEvent<HTMLDivElement>) => void
  panelRef: RefObject<HTMLElement | null>
}

export function ContextPanelConnected({
  onBrowseSessions,
  onResizeStart,
  panelRef,
}: ContextPanelConnectedProps) {
  const foundationStore = useFoundationStore()
  const liveSessionStore = useLiveSessionStore()
  const sessionStore = useSessionStore()
  const uiStore = useUIStore()
  const props = useValue(() =>
    buildContextPanelProps({
      foundationStore,
      liveSessionStore,
      onBrowseSessions,
      onResizeStart,
      panelRef,
      sessionStore,
      uiStore,
    }),
  )

  return <ContextPanel {...props} />
}
