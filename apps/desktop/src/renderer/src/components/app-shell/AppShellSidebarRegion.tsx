import { useValue } from '@legendapp/state/react'
import {
  useFoundationStore,
  useLiveSessionStore,
  useSessionStore,
  useUIStore,
} from '../../state/root/store-provider'
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
  const isSidebarHidden = useValue(uiStore.state$.isSidebarHidden)

  if (isSidebarHidden) {
    return null
  }

  return (
    <AppShellSidebar prefersReducedMotion={prefersReducedMotion} shouldAnimate={shouldAnimate} />
  )
}
