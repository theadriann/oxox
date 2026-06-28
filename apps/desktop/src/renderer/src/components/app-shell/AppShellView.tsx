import { useValue } from '@legendapp/state/react'
import { useUIStore } from '../../state/root/store-provider'
import { AppShellMainContent } from './AppShellMainContent'
import { AppShellSidebarRegion } from './AppShellSidebarRegion'
import { AppShellTopBarConnected } from './AppShellTopBarConnected'
import { AsyncActionStackConnected } from './AsyncActionStackConnected'
import { CommandPaletteConnected } from './CommandPaletteConnected'
import { StatusBarConnected } from './StatusBarConnected'

interface AppShellViewProps {
  prefersReducedMotion: boolean
}

export function AppShellView({ prefersReducedMotion }: AppShellViewProps) {
  const uiStore = useUIStore()
  const isSidebarHidden = useValue(uiStore.state$.isSidebarHidden)
  const isSearchOpen = useValue(() => uiStore.isSearchOpen())
  const layoutModeClass = isSearchOpen
    ? 'oxox-app-layout--search'
    : isSidebarHidden
      ? 'oxox-app-layout--sidebar-hidden'
      : 'oxox-app-layout--sidebar-visible'

  return (
    <div
      className="relative h-[100dvh] overflow-hidden bg-fd-canvas text-fd-primary"
      data-motion-mode={prefersReducedMotion ? 'reduced' : 'full'}
    >
      <CommandPaletteConnected />
      <AsyncActionStackConnected />

      <div className="absolute inset-x-0 top-0 z-10">
        <AppShellTopBarConnected />
      </div>

      <div className={`oxox-app-layout h-full ${layoutModeClass}`}>
        {isSearchOpen ? null : (
          <AppShellSidebarRegion prefersReducedMotion={prefersReducedMotion} />
        )}
        <div className="flex min-h-0 min-w-0 flex-col pt-12.5">
          <AppShellMainContent prefersReducedMotion={prefersReducedMotion} />
          <StatusBarConnected />
        </div>
      </div>
    </div>
  )
}
