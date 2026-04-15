import { observer } from 'mobx-react-lite'

import { useSessionStore, useUIStore } from '../../stores/StoreProvider'
import type { CommandPaletteAction } from '../command-palette/CommandPalette'
import { CommandPalette } from '../command-palette/CommandPalette'
import { useOptionalAppShellControllerContext } from './AppShellControllerContext'

interface CommandPaletteConnectedProps {
  commandPalette?: {
    closePalette: () => void
    commands: CommandPaletteAction[]
    handleSessionSelection: (sessionId: string) => void
    openPalette: () => void
  }
}

export const CommandPaletteConnected = observer(function CommandPaletteConnected({
  commandPalette,
}: CommandPaletteConnectedProps) {
  const sessionStore = useSessionStore()
  const uiStore = useUIStore()
  const controller = useOptionalAppShellControllerContext()
  const resolvedCommandPalette = commandPalette ?? controller?.commandPalette

  if (!resolvedCommandPalette) {
    throw new Error(
      'CommandPaletteConnected requires a commandPalette prop when no AppShellControllerProvider is present',
    )
  }

  return (
    <CommandPalette
      open={uiStore.isCommandPaletteOpen}
      commands={resolvedCommandPalette.commands}
      sessions={sessionStore.sessions}
      onOpenChange={(open) =>
        open ? resolvedCommandPalette.openPalette() : resolvedCommandPalette.closePalette()
      }
      onSelectSession={resolvedCommandPalette.handleSessionSelection}
    />
  )
})
