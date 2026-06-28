import { useValue } from '@legendapp/state/react'
import { AnimatePresence, motion } from 'framer-motion'
import { useMemo } from 'react'

import { createPanelVariants } from '../../lib/motion'
import { useUIStore } from '../../state/root/store-provider'
import { ContextPanelConnected } from '../context-panel/ContextPanelConnected'
import { GitDiffPanelConnected } from '../context-panel/GitDiffPanelConnected'
import { useAppShellControllerContext } from './AppShellControllerContext'
import { buildAppShellContextPanelState } from './connectedSelectors'
import { RightContextRail } from './RightContextRail'

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
  const isContextPanelHidden = useValue(uiStore.state$.isContextPanelHidden)
  const contextPanelMode = useValue(uiStore.state$.contextPanelMode)
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
    () =>
      contextPanelMode === 'git-diff' ? (
        <GitDiffPanelConnected panelRef={contextPanelRef} onResizeStart={startContextPanelResize} />
      ) : (
        <ContextPanelConnected
          panelRef={contextPanelRef}
          onBrowseSessions={handleBrowseSessions}
          onResizeStart={startContextPanelResize}
        />
      ),
    [contextPanelMode, contextPanelRef, handleBrowseSessions, startContextPanelResize],
  )
  const rail = useMemo(
    () => (
      <RightContextRail
        activeMode={contextPanelMode}
        isPanelHidden={isContextPanelHidden}
        onTogglePanel={uiStore.toggleContextPanelMode}
      />
    ),
    [contextPanelMode, isContextPanelHidden, uiStore.toggleContextPanelMode],
  )

  if (!shouldAnimate) {
    return (
      <div className="flex h-full min-h-0 min-w-0 overflow-hidden">
        {contextPanelState.isHidden ? null : (
          <div className="h-full min-h-0 min-w-0 flex-1 overflow-hidden">{panel}</div>
        )}
        {rail}
      </div>
    )
  }

  return (
    <div className="flex h-full min-h-0 min-w-0 overflow-hidden">
      <AnimatePresence initial={false} mode="popLayout">
        {!contextPanelState.isHidden ? (
          <motion.div
            key={`context-panel-${contextPanelMode}`}
            layout
            animate="animate"
            className="h-full min-h-0 min-w-0 flex-1 overflow-hidden"
            exit="exit"
            initial="initial"
            variants={createPanelVariants(contextPanelState.prefersReducedMotion, 'right')}
          >
            {panel}
          </motion.div>
        ) : null}
      </AnimatePresence>
      {rail}
    </div>
  )
}
