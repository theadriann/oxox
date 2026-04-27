import { useRef } from 'react'
import { useMountEffect } from '../../hooks/useMountEffect'
import { useValue } from '../../stores/legend'
import { SessionSearchController } from '../../stores/SessionSearchController'
import { useRootStore, useSessionStore, useUIStore } from '../../stores/StoreProvider'
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
  const rootStore = useRootStore()
  const sessionStore = useSessionStore()
  const uiStore = useUIStore()
  const searchControllerRef = useRef(new SessionSearchController(rootStore.api.search.sessions))
  const searchController = searchControllerRef.current
  const controller = useOptionalAppShellControllerContext()
  const resolvedCommandPalette = commandPalette ?? controller?.commandPalette
  const open = useValue(() => uiStore.isCommandPaletteOpen)
  const sessions = useValue(() => {
    if (!open) {
      return []
    }

    if (!rootStore.api.search.sessions || searchController.lastQuery.length === 0) {
      return sessionStore.sessions
    }

    if (searchController.matches.length === 0) {
      return []
    }

    const sessionsById = new Map(sessionStore.sessions.map((session) => [session.id, session]))
    return searchController.matches
      .map((match) => sessionsById.get(match.sessionId))
      .filter((session): session is NonNullable<typeof session> => Boolean(session))
  })
  const commands = useValue(() => (open ? (resolvedCommandPalette?.getCommands() ?? []) : []))

  useMountEffect(() => () => searchController.dispose())

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
      onSearchChange={searchController.scheduleSearch}
      forceMountSessionResults={Boolean(rootStore.api.search.sessions)}
    />
  )
}
