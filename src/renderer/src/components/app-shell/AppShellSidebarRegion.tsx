import { useValue } from '../../stores/legend'
import {
  useFoundationStore,
  useLiveSessionStore,
  useSessionStore,
  useUIStore,
} from '../../stores/StoreProvider'
import { useAppShellControllerContext } from './AppShellControllerContext'
import { AppShellSidebar } from './AppShellSidebar'
import { useAppShellViewModel } from './useAppShellViewModel'

interface AppShellSidebarRegionProps {
  prefersReducedMotion: boolean
}

export function AppShellSidebarRegion({ prefersReducedMotion }: AppShellSidebarRegionProps) {
  const foundationStore = useFoundationStore()
  const liveSessionStore = useLiveSessionStore()
  const sessionStore = useSessionStore()
  const uiStore = useUIStore()
  const { newSessionForm } = useAppShellControllerContext()
  const { shouldAnimate } = useAppShellViewModel({
    foundationStore,
    liveSessionStore,
    newSessionForm,
    prefersReducedMotion,
    sessionStore,
  })
  const isSidebarHidden = useValue(() => uiStore.isSidebarHidden)

  if (isSidebarHidden) {
    return null
  }

  return (
    <AppShellSidebar prefersReducedMotion={prefersReducedMotion} shouldAnimate={shouldAnimate} />
  )
}
