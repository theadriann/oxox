import { AnimatePresence, motion } from 'framer-motion'

import { createLayoutTransition, createViewPresenceVariants } from '../../lib/motion'
import type { ContentLayout, SettingsSection } from '../../stores/UIStore'
import { SettingsPanel } from '../settings/SettingsPanel'
import { SessionComposerConnected } from '../transcript/SessionComposerConnected'
import { AppShellContextPanel } from './AppShellContextPanel'
import { AppShellFeedbackConnected } from './AppShellFeedbackConnected'
import { AppShellSidebar } from './AppShellSidebar'
import { AppTopBar } from './AppTopBar'
import { CommandPaletteConnected } from './CommandPaletteConnected'
import { ContentContainer } from './ContentContainer'
import { DetailPanelConnected } from './DetailPanelConnected'
import { StatusBarConnected } from './StatusBarConnected'
import { TodoListConnected } from './TodoListConnected'

interface AppShellViewProps {
  commandPalette: {
    closePalette: () => void
    commands: Array<unknown>
    handleSessionSelection: (sessionId: string) => void
    openPalette: () => void
  }
  controller: {
    contextPanelRef: React.RefObject<HTMLElement | null>
    contextPanelToggleButtonRef: React.RefObject<HTMLButtonElement | null>
    detailPanelRef: React.RefObject<HTMLElement | null>
    handleAttachSelectedSession: () => Promise<void>
    handleBrowseSessions: () => void
    newSessionForm: {
      isSubmitting: boolean
      openDraft: () => void
      path: string
      showForm: boolean
      submitNewSession: (payload: {
        text: string
        modelId: string
        interactionMode: string
        autonomyLevel: string
      }) => Promise<void>
    }
    startContextPanelResize: (event: React.PointerEvent) => void
    startSidebarResize: (event: React.PointerEvent) => void
    transcriptPrimaryActionRef: React.RefObject<HTMLElement | null>
    transcriptScrollSignal: number
  }
  prefersReducedMotion: boolean
  uiState: {
    contentLayout: ContentLayout
    isContextPanelHidden: boolean
    isSidebarHidden: boolean
    isSettingsOpen: boolean
    settingsSection: SettingsSection
    toggleContextPanel: () => void
    toggleSidebar: () => void
  }
  viewModel: {
    canComposeDetached: boolean
    detailViewKey: string
    sessionProjectLabel?: string
    sessionTitle?: string
    shouldAnimate: boolean
    shouldRenderComposer: boolean
    sidebarErrorState:
      | {
          title: string
          description: string
          actionLabel: string
          onAction: () => void
        }
      | undefined
  }
}

export function AppShellView({
  commandPalette,
  controller,
  prefersReducedMotion,
  uiState,
  viewModel,
}: AppShellViewProps) {
  return (
    <div
      className="relative h-screen bg-fd-canvas text-fd-primary"
      data-motion-mode={prefersReducedMotion ? 'reduced' : 'full'}
    >
      <CommandPaletteConnected commandPalette={commandPalette} />

      {/* Top bar: floats above sidebar + content */}
      <div className="absolute inset-x-0 top-0 z-10">
        {uiState.isSettingsOpen ? (
          <AppTopBar
            sessionTitle="Settings"
            sessionProjectLabel={undefined}
            isSidebarHidden={uiState.isSidebarHidden}
            onToggleSidebar={uiState.toggleSidebar}
          />
        ) : (
          <AppTopBar
            sessionTitle={viewModel.sessionTitle}
            sessionProjectLabel={viewModel.sessionProjectLabel}
            isSidebarHidden={uiState.isSidebarHidden}
            isContextPanelHidden={uiState.isContextPanelHidden}
            onToggleSidebar={uiState.toggleSidebar}
            onToggleContextPanel={uiState.toggleContextPanel}
          />
        )}
      </div>

      {/* Body: sidebar + content, both full height */}
      <div
        className={`oxox-app-layout h-full ${uiState.isSidebarHidden ? 'oxox-app-layout--sidebar-hidden' : 'oxox-app-layout--sidebar-visible'}`}
      >
        {!uiState.isSidebarHidden ? (
          <AppShellSidebar
            errorState={viewModel.sidebarErrorState}
            prefersReducedMotion={prefersReducedMotion}
            shouldAnimate={viewModel.shouldAnimate}
            onNewSession={controller.newSessionForm.openDraft}
            onResizeStart={controller.startSidebarResize}
          />
        ) : null}

        <div className="flex min-h-0 min-w-0 flex-col pt-[50px]">
          {uiState.isSettingsOpen ? (
            <div className="flex-1 overflow-y-auto">
              <SettingsPanel section={uiState.settingsSection} />
            </div>
          ) : (
            <>
              <AppShellFeedbackConnected />

              <div
                className={`oxox-content-area flex-1 min-h-0 ${uiState.isContextPanelHidden ? 'oxox-content-area--without-context' : 'oxox-content-area--with-context'}`}
              >
                <motion.section
                  layout
                  ref={controller.detailPanelRef}
                  aria-label="Session detail panel"
                  className="flex min-h-0 min-w-0 flex-col overflow-hidden"
                  transition={createLayoutTransition(prefersReducedMotion)}
                >
                  <div className="flex-1 min-h-0 overflow-hidden px-4 pt-2">
                    <ContentContainer
                      layout={uiState.contentLayout}
                      className="flex h-full min-h-0 flex-col"
                    >
                      <AnimatePresence initial={false} mode="wait">
                        <motion.div
                          key={viewModel.detailViewKey}
                          animate={viewModel.shouldAnimate ? 'animate' : undefined}
                          className="flex min-h-0 flex-1 flex-col gap-1.5"
                          exit={viewModel.shouldAnimate ? 'exit' : undefined}
                          initial={viewModel.shouldAnimate ? 'initial' : false}
                          variants={
                            viewModel.shouldAnimate
                              ? createViewPresenceVariants(prefersReducedMotion)
                              : undefined
                          }
                        >
                          <DetailPanelConnected
                            newSessionForm={controller.newSessionForm}
                            transcriptScrollSignal={controller.transcriptScrollSignal}
                            transcriptPrimaryActionRef={controller.transcriptPrimaryActionRef}
                            onBrowseSessions={controller.handleBrowseSessions}
                          />
                        </motion.div>
                      </AnimatePresence>
                    </ContentContainer>
                  </div>
                  <div className="flex flex-col gap-2 pb-2">
                    <ContentContainer layout={uiState.contentLayout}>
                      <TodoListConnected />
                      {viewModel.shouldRenderComposer ? (
                        <SessionComposerConnected
                          canComposeDetached={viewModel.canComposeDetached}
                          isSubmittingDetached={controller.newSessionForm.isSubmitting}
                          onAttach={() => void controller.handleAttachSelectedSession()}
                          onSubmitDetached={(payload) =>
                            void controller.newSessionForm.submitNewSession(payload)
                          }
                        />
                      ) : null}
                    </ContentContainer>
                  </div>
                </motion.section>

                <AppShellContextPanel
                  panelRef={controller.contextPanelRef}
                  prefersReducedMotion={prefersReducedMotion}
                  shouldAnimate={viewModel.shouldAnimate}
                  onBrowseSessions={controller.handleBrowseSessions}
                  onResizeStart={controller.startContextPanelResize}
                />
              </div>
            </>
          )}

          <StatusBarConnected />
        </div>
      </div>
    </div>
  )
}
