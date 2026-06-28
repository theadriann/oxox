import { useReducedMotion } from 'framer-motion'
import { useStores } from '../../state/root/store-provider'
import { SessionForkDialogConnected } from '../transcript/SessionForkDialogConnected'
import { SessionRenameDialogConnected } from '../transcript/SessionRenameDialogConnected'
import { SessionRewindDialogConnected } from '../transcript/SessionRewindDialogConnected'
import { AppShellControllerProvider } from './AppShellControllerContext'
import { AppShellView } from './AppShellView'
import { useAppShellController } from './useAppShellController'

export function AppShell() {
  const {
    composerStore,
    foundationStore,
    liveSessionStore,
    pluginCapabilityStore,
    pluginHostStore,
    rootStore,
    sessionStore,
    transcriptStore,
    uiStore,
    updateStore,
  } = useStores()
  const prefersReducedMotion = useReducedMotion()
  const controller = useAppShellController({
    composerStore,
    foundationStore,
    liveSessionStore,
    pluginCapabilityStore,
    pluginHostStore,
    rootStore,
    sessionStore,
    transcriptStore,
    uiStore,
    updateStore,
  })

  return (
    <AppShellControllerProvider value={controller}>
      <SessionForkDialogConnected />
      <SessionRenameDialogConnected />
      <SessionRewindDialogConnected />
      <AppShellView prefersReducedMotion={prefersReducedMotion ?? false} />
    </AppShellControllerProvider>
  )
}
