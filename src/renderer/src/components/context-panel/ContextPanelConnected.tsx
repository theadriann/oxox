import { observer } from 'mobx-react-lite'
import type { PointerEvent as ReactPointerEvent, RefObject } from 'react'

import { useStores } from '../../stores/StoreProvider'
import { ContextPanel } from './ContextPanel'
import { buildContextPanelProps } from './contextPanelSelectors'

interface ContextPanelConnectedProps {
  onBrowseSessions: () => void
  onResizeStart: (event: ReactPointerEvent<HTMLDivElement>) => void
  panelRef: RefObject<HTMLElement | null>
}

export const ContextPanelConnected = observer(function ContextPanelConnected({
  onBrowseSessions,
  onResizeStart,
  panelRef,
}: ContextPanelConnectedProps) {
  const { foundationStore, liveSessionStore, sessionStore, uiStore } = useStores()
  const props = buildContextPanelProps({
    foundationStore,
    liveSessionStore,
    onBrowseSessions,
    onResizeStart,
    panelRef,
    sessionStore,
    uiStore,
  })

  return <ContextPanel {...props} />
})
