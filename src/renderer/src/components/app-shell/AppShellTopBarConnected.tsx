import { useValue } from '@legendapp/state/react'
import { useLiveSessionStore, useSessionStore, useUIStore } from '../../state/root/store-provider'
import { useAppShellControllerContext } from './AppShellControllerContext'
import { AppTopBar } from './AppTopBar'

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

  if (isSettingsOpen) {
    return (
      <AppTopBar
        sessionTitle="Settings"
        sessionProjectLabel={undefined}
        isSidebarHidden={isSidebarHidden}
        isSearchOpen={isSearchOpen}
        onToggleSidebar={uiStore.toggleSidebar}
        onOpenSearch={uiStore.openSearch}
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
        onOpenSearch={uiStore.openSearch}
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
      onOpenSearch={uiStore.openSearch}
    />
  )
}
