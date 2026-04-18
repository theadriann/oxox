import { useValue } from '../../stores/legend'
import { useLiveSessionStore, useSessionStore, useUIStore } from '../../stores/StoreProvider'
import { useAppShellControllerContext } from './AppShellControllerContext'
import { AppTopBar } from './AppTopBar'

export function AppShellTopBarConnected() {
  const liveSessionStore = useLiveSessionStore()
  const sessionStore = useSessionStore()
  const uiStore = useUIStore()
  const { newSessionForm } = useAppShellControllerContext()
  const isSettingsOpen = useValue(() => uiStore.isSettingsOpen)
  const isSidebarHidden = useValue(() => uiStore.isSidebarHidden)
  const isContextPanelHidden = useValue(() => uiStore.isContextPanelHidden)
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
        onToggleSidebar={uiStore.toggleSidebar}
      />
    )
  }

  return (
    <AppTopBar
      sessionTitle={sessionTitle}
      sessionProjectLabel={sessionProjectLabel}
      isSidebarHidden={isSidebarHidden}
      isContextPanelHidden={isContextPanelHidden}
      onToggleSidebar={uiStore.toggleSidebar}
      onToggleContextPanel={uiStore.toggleContextPanel}
    />
  )
}
