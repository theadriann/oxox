import { useValue } from '@legendapp/state/react'
import { AnimatePresence, motion } from 'framer-motion'

import { createLayoutTransition, createViewPresenceVariants } from '../../lib/motion'
import {
  useFoundationStore,
  useLiveSessionStore,
  useSessionStore,
  useUIStore,
} from '../../state/root/store-provider'
import { FullPageSearchConnected } from '../search/FullPageSearchConnected'
import { SettingsPanel } from '../settings/SettingsPanel'
import { SessionComposerConnected } from '../transcript/SessionComposerConnected'
import { AppShellContextPanel } from './AppShellContextPanel'
import { useAppShellControllerContext } from './AppShellControllerContext'
import { AppShellFeedbackConnected } from './AppShellFeedbackConnected'
import { ContentContainer } from './ContentContainer'
import { DetailPanelConnected } from './DetailPanelConnected'
import { TodoListConnected } from './TodoListConnected'
import { UpdatePromptConnected } from './UpdatePromptConnected'
import { useAppShellViewModel } from './useAppShellViewModel'

interface AppShellMainContentProps {
  prefersReducedMotion: boolean
}

export function AppShellMainContent({ prefersReducedMotion }: AppShellMainContentProps) {
  const foundationStore = useFoundationStore()
  const liveSessionStore = useLiveSessionStore()
  const sessionStore = useSessionStore()
  const uiStore = useUIStore()
  const { detailPanelRef, newSessionForm } = useAppShellControllerContext()
  const { canComposeDetached, detailViewKey, shouldAnimate, shouldRenderComposer } =
    useAppShellViewModel({
      foundationStore,
      liveSessionStore,
      newSessionForm,
      prefersReducedMotion,
      sessionStore,
    })
  const isSettingsOpen = useValue(() => uiStore.isSettingsOpen())
  const isSearchOpen = useValue(() => uiStore.isSearchOpen())
  const settingsSection = useValue(uiStore.state$.settingsSection)
  const isContextPanelHidden = useValue(uiStore.state$.isContextPanelHidden)
  const contentLayout = useValue(uiStore.state$.contentLayout)
  const contextLayoutClass = isContextPanelHidden
    ? 'oxox-content-area--with-context-rail'
    : 'oxox-content-area--with-context'

  if (isSettingsOpen) {
    return (
      <div className="flex-1 overflow-y-auto">
        <SettingsPanel section={settingsSection} />
      </div>
    )
  }

  if (isSearchOpen) {
    return (
      <div className="min-h-0 flex-1 overflow-hidden">
        <FullPageSearchConnected />
      </div>
    )
  }

  return (
    <>
      <AppShellFeedbackConnected />
      <UpdatePromptConnected />

      <div className={`oxox-content-area flex-1 min-h-0 ${contextLayoutClass}`}>
        <motion.section
          layout
          ref={detailPanelRef}
          aria-label="Session detail panel"
          className="flex min-h-0 min-w-0 flex-col overflow-hidden"
          transition={createLayoutTransition(prefersReducedMotion)}
        >
          <div className="flex-1 min-h-0 overflow-hidden px-4 pt-2">
            <ContentContainer layout={contentLayout} className="flex h-full min-h-0 flex-col">
              <AnimatePresence initial={false} mode="wait">
                <motion.div
                  key={detailViewKey}
                  animate={shouldAnimate ? 'animate' : undefined}
                  className="flex min-h-0 flex-1 flex-col gap-1.5"
                  exit={shouldAnimate ? 'exit' : undefined}
                  initial={shouldAnimate ? 'initial' : false}
                  variants={
                    shouldAnimate ? createViewPresenceVariants(prefersReducedMotion) : undefined
                  }
                >
                  <DetailPanelConnected />
                </motion.div>
              </AnimatePresence>
            </ContentContainer>
          </div>
          <div className="flex flex-col gap-2 pb-2">
            <ContentContainer layout={contentLayout}>
              <div className="ox-composer overflow-hidden rounded-lg">
                <TodoListConnected />
                {shouldRenderComposer ? (
                  <SessionComposerConnected canComposeDetached={canComposeDetached} />
                ) : null}
              </div>
            </ContentContainer>
          </div>
        </motion.section>

        <AppShellContextPanel
          prefersReducedMotion={prefersReducedMotion}
          shouldAnimate={shouldAnimate}
        />
      </div>
    </>
  )
}
