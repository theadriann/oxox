import { AnimatePresence, motion } from 'framer-motion'
import { observer } from 'mobx-react-lite'
import { type PointerEvent as ReactPointerEvent, type RefObject, useMemo } from 'react'

import { createPanelVariants } from '../../lib/motion'
import { useStores } from '../../stores/StoreProvider'
import { ContextPanelConnected } from '../context-panel/ContextPanelConnected'
import { buildAppShellContextPanelState } from './connectedSelectors'

interface AppShellContextPanelProps {
  panelRef: RefObject<HTMLElement | null>
  prefersReducedMotion: boolean
  shouldAnimate: boolean
  onBrowseSessions: () => void
  onResizeStart: (event: ReactPointerEvent<HTMLDivElement>) => void
}

export const AppShellContextPanel = observer(function AppShellContextPanel({
  panelRef,
  prefersReducedMotion,
  shouldAnimate,
  onBrowseSessions,
  onResizeStart,
}: AppShellContextPanelProps) {
  const { uiStore } = useStores()
  const contextPanelState = useMemo(
    () =>
      buildAppShellContextPanelState({
        isContextPanelHidden: uiStore.isContextPanelHidden,
        prefersReducedMotion,
        shouldAnimate,
      }),
    [uiStore.isContextPanelHidden, prefersReducedMotion, shouldAnimate],
  )
  const panel = useMemo(
    () => (
      <ContextPanelConnected
        panelRef={panelRef}
        onBrowseSessions={onBrowseSessions}
        onResizeStart={onResizeStart}
      />
    ),
    [panelRef, onBrowseSessions, onResizeStart],
  )

  if (!shouldAnimate) {
    return contextPanelState.isHidden ? null : <div className="min-w-0">{panel}</div>
  }

  return (
    <AnimatePresence initial={false} mode="popLayout">
      {!contextPanelState.isHidden ? (
        <motion.div
          key="context-panel"
          layout
          animate="animate"
          className="min-w-0"
          exit="exit"
          initial="initial"
          variants={createPanelVariants(contextPanelState.prefersReducedMotion, 'right')}
        >
          {panel}
        </motion.div>
      ) : null}
    </AnimatePresence>
  )
})
