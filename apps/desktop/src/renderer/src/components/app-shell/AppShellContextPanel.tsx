import { useValue } from '@legendapp/state/react'
import { AnimatePresence, motion } from 'framer-motion'
import { useMemo } from 'react'

import { createPanelVariants } from '../../lib/motion'
import { useUIStore } from '../../state/root/store-provider'
import { ContextPanelConnected } from '../context-panel/ContextPanelConnected'
import { GitDiffPanelConnected } from '../context-panel/GitDiffPanelConnected'
import { Button } from '../ui/button'
import { useAppShellControllerContext } from './AppShellControllerContext'
import { buildAppShellContextPanelState } from './connectedSelectors'
import { RAIL_ITEMS, RightContextRail } from './RightContextRail'

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
      <div
        className="oxox-context-panel-region flex h-full min-h-0 min-w-0 overflow-hidden"
        data-panel-hidden={contextPanelState.isHidden ? 'true' : 'false'}
      >
        {contextPanelState.isHidden ? null : (
          <>
            <button
              aria-label="Close session details"
              className="oxox-context-panel-backdrop"
              type="button"
              onClick={uiStore.toggleContextPanel}
            />
            <div
              className="flex h-full min-h-0 min-w-0 flex-1 flex-col overflow-hidden"
              data-context-panel-sheet
            >
              <MobileContextPanelTabs
                activeMode={contextPanelMode}
                onSelectMode={uiStore.setContextPanelMode}
              />
              <div className="min-h-0 flex-1 overflow-hidden">{panel}</div>
            </div>
          </>
        )}
        {rail}
      </div>
    )
  }

  return (
    <div
      className="oxox-context-panel-region flex h-full min-h-0 min-w-0 overflow-hidden"
      data-panel-hidden={contextPanelState.isHidden ? 'true' : 'false'}
    >
      {contextPanelState.isHidden ? null : (
        <button
          aria-label="Close session details"
          className="oxox-context-panel-backdrop"
          type="button"
          onClick={uiStore.toggleContextPanel}
        />
      )}
      <AnimatePresence initial={false} mode="popLayout">
        {!contextPanelState.isHidden ? (
          <motion.div
            key={`context-panel-${contextPanelMode}`}
            layout
            animate="animate"
            className="flex h-full min-h-0 min-w-0 flex-1 flex-col overflow-hidden"
            data-context-panel-sheet
            exit="exit"
            initial="initial"
            variants={createPanelVariants(contextPanelState.prefersReducedMotion, 'right')}
          >
            <MobileContextPanelTabs
              activeMode={contextPanelMode}
              onSelectMode={uiStore.setContextPanelMode}
            />
            <div className="min-h-0 flex-1 overflow-hidden">{panel}</div>
          </motion.div>
        ) : null}
      </AnimatePresence>
      {rail}
    </div>
  )
}

function MobileContextPanelTabs({
  activeMode,
  onSelectMode,
}: {
  activeMode: (typeof RAIL_ITEMS)[number]['mode']
  onSelectMode: (mode: (typeof RAIL_ITEMS)[number]['mode']) => void
}) {
  return (
    <div className="oxox-context-panel-mobile-tabs grid grid-cols-2 gap-1 border-b border-fd-border-subtle bg-fd-panel/80 p-1 xl:hidden">
      {RAIL_ITEMS.map(({ mode, label, Icon }) => {
        const isActive = activeMode === mode

        return (
          <Button
            key={mode}
            aria-label={`Show ${label}`}
            aria-pressed={isActive}
            className={`h-9 justify-center gap-2 text-xs ${isActive ? 'bg-white/[0.08] text-fd-primary' : 'text-fd-tertiary'}`}
            type="button"
            variant="ghost"
            onClick={() => onSelectMode(mode)}
          >
            <Icon className="size-3.5" />
            {label}
          </Button>
        )
      })}
    </div>
  )
}
