import { useValue } from '../../stores/legend'
import { useUIStore } from '../../stores/StoreProvider'
import { AppShellMainContent } from './AppShellMainContent'
import { AppShellSidebarRegion } from './AppShellSidebarRegion'
import { AppShellTopBarConnected } from './AppShellTopBarConnected'
import { CommandPaletteConnected } from './CommandPaletteConnected'
import { StatusBarConnected } from './StatusBarConnected'

interface AppShellViewProps {
  prefersReducedMotion: boolean
}

export function AppShellView({ prefersReducedMotion }: AppShellViewProps) {
  const uiStore = useUIStore()
  const isSidebarHidden = useValue(() => uiStore.isSidebarHidden)

  return (
    <div
      className="relative h-screen bg-fd-canvas text-fd-primary"
      data-motion-mode={prefersReducedMotion ? 'reduced' : 'full'}
    >
      <CommandPaletteConnected />

      <div className="absolute inset-x-0 top-0 z-10">
        <AppShellTopBarConnected />
      </div>

      <div
        className={`oxox-app-layout h-full ${isSidebarHidden ? 'oxox-app-layout--sidebar-hidden' : 'oxox-app-layout--sidebar-visible'}`}
      >
        <AppShellSidebarRegion prefersReducedMotion={prefersReducedMotion} />
        <div className="flex min-h-0 min-w-0 flex-col pt-12.5">
          <AppShellMainContent prefersReducedMotion={prefersReducedMotion} />
          <StatusBarConnected />
        </div>
      </div>
    </div>
  )
}
