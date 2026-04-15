import { observer } from 'mobx-react-lite'

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

export const AppShellSidebarRegion = observer(function AppShellSidebarRegion({
  prefersReducedMotion,
}: AppShellSidebarRegionProps) {
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

  if (uiStore.isSidebarHidden) {
    return null
  }

  return (
    <AppShellSidebar prefersReducedMotion={prefersReducedMotion} shouldAnimate={shouldAnimate} />
  )
})
