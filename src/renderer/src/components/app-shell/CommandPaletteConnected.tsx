import { observer } from 'mobx-react-lite'
import { useMemo } from 'react'

import { useStores } from '../../stores/StoreProvider'
import type { CommandPaletteAction } from '../command-palette/CommandPalette'
import { CommandPalette } from '../command-palette/CommandPalette'

interface CommandPaletteConnectedProps {
  commandPalette: {
    closePalette: () => void
    commands: CommandPaletteAction[]
    handleSessionSelection: (sessionId: string) => void
    openPalette: () => void
  }
}

export const CommandPaletteConnected = observer(function CommandPaletteConnected({
  commandPalette,
}: CommandPaletteConnectedProps) {
  const { sessionStore, uiStore } = useStores()

  const sessions = useMemo(() => sessionStore.sessions.slice(), [sessionStore.sessions])

  return (
    <CommandPalette
      open={uiStore.isCommandPaletteOpen}
      commands={commandPalette.commands}
      sessions={sessions}
      onOpenChange={(open) => (open ? commandPalette.openPalette() : commandPalette.closePalette())}
      onSelectSession={commandPalette.handleSessionSelection}
    />
  )
})
