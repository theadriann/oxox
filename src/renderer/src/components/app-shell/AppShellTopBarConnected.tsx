import { observer } from 'mobx-react-lite'

import { useLiveSessionStore, useSessionStore, useUIStore } from '../../stores/StoreProvider'
import { useAppShellControllerContext } from './AppShellControllerContext'
import { AppTopBar } from './AppTopBar'

export const AppShellTopBarConnected = observer(function AppShellTopBarConnected() {
  const liveSessionStore = useLiveSessionStore()
  const sessionStore = useSessionStore()
  const uiStore = useUIStore()
  const { newSessionForm } = useAppShellControllerContext()

  if (uiStore.isSettingsOpen) {
    return (
      <AppTopBar
        sessionTitle="Settings"
        sessionProjectLabel={undefined}
        isSidebarHidden={uiStore.isSidebarHidden}
        onToggleSidebar={uiStore.toggleSidebar}
      />
    )
  }

  const sessionTitle = newSessionForm.showForm
    ? 'New session'
    : (liveSessionStore.selectedSnapshot?.title ?? sessionStore.selectedSession?.title)

  const sessionProjectLabel = newSessionForm.showForm
    ? newSessionForm.path || undefined
    : (liveSessionStore.selectedSnapshot?.projectWorkspacePath ??
      sessionStore.selectedSession?.projectLabel)

  return (
    <AppTopBar
      sessionTitle={sessionTitle}
      sessionProjectLabel={sessionProjectLabel}
      isSidebarHidden={uiStore.isSidebarHidden}
      isContextPanelHidden={uiStore.isContextPanelHidden}
      onToggleSidebar={uiStore.toggleSidebar}
      onToggleContextPanel={uiStore.toggleContextPanel}
    />
  )
})
