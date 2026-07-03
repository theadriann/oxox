import { useValue } from '@legendapp/state/react'
import { useCallback } from 'react'
import { useLiveSessionStore, useSessionStore, useUIStore } from '../../state/root/store-provider'
import { useAppShellControllerContext } from './AppShellControllerContext'
import { AppTopBar } from './AppTopBar'

const MOBILE_LAYOUT_QUERY = '(max-width: 1279px)'

function isMobileLayout(): boolean {
  return window.matchMedia?.(MOBILE_LAYOUT_QUERY).matches ?? false
}

export function AppShellTopBarConnected() {
  const liveSessionStore = useLiveSessionStore()
  const sessionStore = useSessionStore()
  const uiStore = useUIStore()
  const { newSessionForm } = useAppShellControllerContext()
  const isSettingsOpen = useValue(() => uiStore.isSettingsOpen())
  const isSearchOpen = useValue(() => uiStore.isSearchOpen())
  const isSidebarHidden = useValue(uiStore.state$.isSidebarHidden)
  const isContextPanelHidden = useValue(uiStore.state$.isContextPanelHidden)
  const sessionTitle = useValue(() =>
    newSessionForm.showForm
      ? 'New session'
      : (liveSessionStore.selectedSnapshot?.title ?? sessionStore.selectedSession?.title),
  )
  const sessionProjectLabel = useValue(() =>
    newSessionForm.showForm
      ? newSessionForm.path || undefined
      : (liveSessionStore.selectedSnapshot?.projectWorkspacePath ??
        sessionStore.selectedSession?.projectLabel),
  )
  const handleNewSession = useCallback(() => {
    newSessionForm.openDraft()

    if (isMobileLayout()) {
      uiStore.hideSidebar()
    }
  }, [newSessionForm, uiStore])

  if (isSettingsOpen) {
    return (
      <AppTopBar
        sessionTitle="Settings"
        sessionProjectLabel={undefined}
        isSidebarHidden={isSidebarHidden}
        isSearchOpen={isSearchOpen}
        onToggleSidebar={uiStore.toggleSidebar}
        onOpenSearch={uiStore.toggleSearch}
      />
    )
  }

  if (isSearchOpen) {
    return (
      <AppTopBar
        sessionTitle="Search"
        sessionProjectLabel="All sessions"
        isSidebarHidden
        isSearchOpen={isSearchOpen}
        onToggleSidebar={uiStore.toggleSidebar}
        onOpenSearch={uiStore.toggleSearch}
      />
    )
  }

  return (
    <AppTopBar
      sessionTitle={sessionTitle}
      sessionProjectLabel={sessionProjectLabel}
      isSidebarHidden={isSearchOpen || isSidebarHidden}
      isContextPanelHidden={isContextPanelHidden}
      isSearchOpen={isSearchOpen}
      onToggleSidebar={uiStore.toggleSidebar}
      onToggleContextPanel={uiStore.toggleContextPanel}
      onOpenSearch={uiStore.toggleSearch}
      onNewSession={handleNewSession}
    />
  )
}
