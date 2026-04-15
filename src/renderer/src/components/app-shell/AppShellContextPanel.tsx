import { AnimatePresence, motion } from 'framer-motion'
import { observer } from 'mobx-react-lite'
import { useMemo } from 'react'

import { createPanelVariants } from '../../lib/motion'
import { useUIStore } from '../../stores/StoreProvider'
import { ContextPanelConnected } from '../context-panel/ContextPanelConnected'
import { useAppShellControllerContext } from './AppShellControllerContext'
import { buildAppShellContextPanelState } from './connectedSelectors'

interface AppShellContextPanelProps {
  prefersReducedMotion: boolean
  shouldAnimate: boolean
}

export const AppShellContextPanel = observer(function AppShellContextPanel({
  prefersReducedMotion,
  shouldAnimate,
}: AppShellContextPanelProps) {
  const uiStore = useUIStore()
  const { contextPanelRef, handleBrowseSessions, startContextPanelResize } =
    useAppShellControllerContext()
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
        panelRef={contextPanelRef}
        onBrowseSessions={handleBrowseSessions}
        onResizeStart={startContextPanelResize}
      />
    ),
    [contextPanelRef, handleBrowseSessions, startContextPanelResize],
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
