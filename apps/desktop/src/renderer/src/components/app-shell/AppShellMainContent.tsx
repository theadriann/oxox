import { useValue } from '@legendapp/state/react'
import { AnimatePresence, motion } from 'framer-motion'
import { useEffect, useState } from 'react'

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

const TRANSCRIPT_COMPOSER_BOTTOM_GAP_PX = 28

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
  const [composerContainer, setComposerContainer] = useState<HTMLDivElement | null>(null)
  const composerBottomInsetPx =
    useElementHeight(composerContainer) + TRANSCRIPT_COMPOSER_BOTTOM_GAP_PX
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
          className="relative min-h-0 min-w-0 overflow-hidden"
          transition={createLayoutTransition(prefersReducedMotion)}
        >
          <div className="absolute inset-0 overflow-hidden pt-2">
            <div className="flex h-full min-h-0 w-full flex-col">
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
                  <DetailPanelConnected transcriptBottomInsetPx={composerBottomInsetPx} />
                </motion.div>
              </AnimatePresence>
            </div>
          </div>
          <div
            ref={setComposerContainer}
            className="pointer-events-none absolute inset-x-0 bottom-0 z-10 pb-2"
          >
            <ContentContainer
              layout={contentLayout}
              className="pointer-events-none absolute inset-x-0 bottom-2 z-0 h-[calc(100%+32px)]"
              data-testid="composer-bottom-veil"
            >
              <div className="-mx-1 h-full rounded-xl bg-[linear-gradient(to_top,var(--fd-canvas)_0%,color-mix(in_srgb,var(--fd-canvas)_94%,transparent)_72%,transparent_100%)]" />
            </ContentContainer>
            <ContentContainer layout={contentLayout} className="relative z-10">
              <div className="ox-composer pointer-events-auto overflow-hidden rounded-lg">
                <TodoListConnected />
                {shouldRenderComposer ? (
                  <SessionComposerConnected canComposeDetached={canComposeDetached} />
                ) : null}
              </div>
            </ContentContainer>
            <div className="pointer-events-none absolute inset-x-0 bottom-0 h-2 bg-fd-canvas" />
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

function useElementHeight(element: HTMLElement | null): number {
  const [height, setHeight] = useState(0)

  useEffect(() => {
    if (!element) {
      setHeight(0)
      return
    }

    const updateHeight = () => {
      setHeight(Math.ceil(element.getBoundingClientRect().height))
    }

    updateHeight()

    if (typeof ResizeObserver === 'undefined') {
      return
    }

    const observer = new ResizeObserver(updateHeight)
    observer.observe(element)

    return () => observer.disconnect()
  }, [element])

  return height
}
