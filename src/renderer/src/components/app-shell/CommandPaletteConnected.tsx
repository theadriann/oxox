import { useValue } from '../../stores/legend'
import { useSessionStore, useUIStore } from '../../stores/StoreProvider'
import type { CommandPaletteAction } from '../command-palette/CommandPalette'
import { CommandPalette } from '../command-palette/CommandPalette'
import { useOptionalAppShellControllerContext } from './AppShellControllerContext'

interface CommandPaletteConnectedProps {
  commandPalette?: {
    closePalette: () => void
    getCommands: () => CommandPaletteAction[]
    handleSessionSelection: (sessionId: string) => void
    openPalette: () => void
  }
}

export function CommandPaletteConnected({ commandPalette }: CommandPaletteConnectedProps) {
  const sessionStore = useSessionStore()
  const uiStore = useUIStore()
  const controller = useOptionalAppShellControllerContext()
  const resolvedCommandPalette = commandPalette ?? controller?.commandPalette
  const open = useValue(() => uiStore.isCommandPaletteOpen)
  const sessions = useValue(() => (open ? sessionStore.sessions : []))
  const commands = useValue(() => (open ? (resolvedCommandPalette?.getCommands() ?? []) : []))

  if (!resolvedCommandPalette) {
    throw new Error(
      'CommandPaletteConnected requires a commandPalette prop when no AppShellControllerProvider is present',
    )
  }

  return (
    <CommandPalette
      open={open}
      commands={commands}
      sessions={sessions}
      onOpenChange={(open) =>
        open ? resolvedCommandPalette.openPalette() : resolvedCommandPalette.closePalette()
      }
      onSelectSession={resolvedCommandPalette.handleSessionSelection}
    />
  )
}
