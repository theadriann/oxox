import { AnimatePresence, motion } from 'framer-motion'
import { useMemo } from 'react'

import { createPanelVariants } from '../../lib/motion'
import { useValue } from '../../stores/legend'
import { useUIStore } from '../../stores/StoreProvider'
import { ContextPanelConnected } from '../context-panel/ContextPanelConnected'
import { useAppShellControllerContext } from './AppShellControllerContext'
import { buildAppShellContextPanelState } from './connectedSelectors'

interface AppShellContextPanelProps {
  prefersReducedMotion: boolean
  shouldAnimate: boolean
}

export function AppShellContextPanel({
  prefersReducedMotion,
  shouldAnimate,
}: AppShellContextPanelProps) {
  const uiStore = useUIStore()
  const { contextPanelRef, handleBrowseSessions, startContextPanelResize } =
    useAppShellControllerContext()
  const isContextPanelHidden = useValue(() => uiStore.isContextPanelHidden)
  const contextPanelState = useMemo(
    () =>
      buildAppShellContextPanelState({
        isContextPanelHidden,
        prefersReducedMotion,
        shouldAnimate,
      }),
    [isContextPanelHidden, prefersReducedMotion, shouldAnimate],
  )
  const panel = useMemo(
    () => (
      <ContextPanelConnected
        panelRef={contextPanelRef}
        onBrowseSessions={handleBrowseSessions}
        onResizeStart={startContextPanelResize}
      />
    ),
    [contextPanelRef, handleBrowseSessions, startContextPanelResize],
  )

  if (!shouldAnimate) {
    return contextPanelState.isHidden ? null : (
      <div className="h-full min-h-0 min-w-0 overflow-hidden">{panel}</div>
    )
  }

  return (
    <AnimatePresence initial={false} mode="popLayout">
      {!contextPanelState.isHidden ? (
        <motion.div
          key="context-panel"
          layout
          animate="animate"
          className="h-full min-h-0 min-w-0 overflow-hidden"
          exit="exit"
          initial="initial"
          variants={createPanelVariants(contextPanelState.prefersReducedMotion, 'right')}
        >
          {panel}
        </motion.div>
      ) : null}
    </AnimatePresence>
  )
}
