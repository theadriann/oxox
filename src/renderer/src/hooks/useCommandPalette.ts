import { Sparkles } from 'lucide-react'
import { useCallback, useRef } from 'react'

import type { CommandPaletteAction } from '../components/command-palette/CommandPalette'
import type { LiveSessionStore } from '../stores/LiveSessionStore'
import type { PluginCapabilityStore } from '../stores/PluginCapabilityStore'
import type { PluginHostStore } from '../stores/PluginHostStore'
import type { SessionStore } from '../stores/SessionStore'
import type { UIStore } from '../stores/UIStore'
import { buildCommandPaletteActions } from './commandPaletteSelectors'

interface UseCommandPaletteOptions {
  sessionStore: SessionStore
  liveSessionStore: LiveSessionStore
  pluginCapabilityStore: PluginCapabilityStore
  pluginHostStore: PluginHostStore
  uiStore: UIStore
  onPickDirectory: () => void | Promise<void>
  onOpenNewWindow: () => void | Promise<void>
  onAttachSelectedSession: () => void | Promise<void>
  onDetachSelectedSession: () => void | Promise<void>
  onCopySelectedSessionId: () => void | Promise<void>
  onCompactSelectedSession: () => void | Promise<void>
  onForkSelectedSession: () => void | Promise<void>
  onRenameSelectedSession: () => void | Promise<void>
  onRewindSelectedSession: () => void | Promise<void>
  onFocusTranscriptPrimaryAction?: () => void
  onSelectSession?: (sessionId: string) => void
}

interface UseCommandPaletteResult {
  closePalette: () => void
  getCommands: () => CommandPaletteAction[]
  handleSessionSelection: (sessionId: string) => void
  openPalette: () => void
}

export function useCommandPalette({
  sessionStore,
  liveSessionStore,
  pluginCapabilityStore,
  pluginHostStore,
  uiStore,
  onPickDirectory,
  onOpenNewWindow,
  onAttachSelectedSession,
  onDetachSelectedSession,
  onCopySelectedSessionId,
  onCompactSelectedSession,
  onForkSelectedSession,
  onRenameSelectedSession,
  onRewindSelectedSession,
  onFocusTranscriptPrimaryAction,
  onSelectSession,
}: UseCommandPaletteOptions): UseCommandPaletteResult {
  const previousFocusedElementRef = useRef<HTMLElement | null>(null)
  const paletteFocusTargetRef = useRef<(() => void) | null>(null)

  const openPalette = useCallback(() => {
    if (uiStore.isCommandPaletteOpen) {
      return
    }

    previousFocusedElementRef.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null
    uiStore.openCommandPalette()
  }, [uiStore])

  const closePalette = useCallback(() => {
    uiStore.closeCommandPalette()

    const nextFocusTarget = paletteFocusTargetRef.current
    const previousFocusedElement = previousFocusedElementRef.current
    paletteFocusTargetRef.current = null

    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        if (nextFocusTarget) {
          nextFocusTarget()
          return
        }

        if (previousFocusedElement?.isConnected) {
          previousFocusedElement.focus()
        }
      })
    })
  }, [uiStore])

  const handleSessionSelection = useCallback(
    (sessionId: string) => {
      paletteFocusTargetRef.current = onFocusTranscriptPrimaryAction ?? null

      if (onSelectSession) {
        onSelectSession(sessionId)
        return
      }

      sessionStore.selectSession(sessionId)
    },
    [onFocusTranscriptPrimaryAction, onSelectSession, sessionStore],
  )

  const getCommands = useCallback((): CommandPaletteAction[] => {
    const selectedSession = sessionStore.selectedSession
    const selectedSessionId = sessionStore.selectedSessionId
    const selectedLiveSession = liveSessionStore.selectedSnapshot
    const runningPluginIds = new Set(pluginHostStore.runningHosts.map((host) => host.pluginId))
    const canAttachSelectedSession = Boolean(
      selectedSessionId &&
        selectedSession?.status !== 'completed' &&
        (!selectedLiveSession || liveSessionStore.selectedNeedsReconnect),
    )
    const pluginAppCommands: CommandPaletteAction[] = pluginCapabilityStore.appActions.map(
      (capability) => ({
        id: `plugin-capability:${capability.qualifiedId}`,
        label: capability.displayName,
        description: `Run the ${capability.pluginId} plugin action.`,
        keywords: [capability.pluginId, capability.name, capability.kind, 'plugin'],
        icon: Sparkles,
        disabled: !runningPluginIds.has(capability.pluginId),
        onSelect: () => {
          void pluginCapabilityStore.invoke(capability.qualifiedId)
        },
      }),
    )

    const pluginSessionCommands: CommandPaletteAction[] = pluginCapabilityStore.sessionActions.map(
      (capability) => ({
        id: `plugin-capability:${capability.qualifiedId}`,
        label: capability.displayName,
        description: `Run the ${capability.pluginId} plugin action for the selected session.`,
        keywords: [capability.pluginId, capability.name, capability.kind, 'plugin'],
        icon: Sparkles,
        disabled: !runningPluginIds.has(capability.pluginId),
        onSelect: () => {
          void pluginCapabilityStore.invoke(capability.qualifiedId, {
            sessionId: selectedSessionId,
          })
        },
      }),
    )

    return buildCommandPaletteActions({
      canAttachSelectedSession,
      onAttachSelectedSession,
      onCompactSelectedSession,
      onCopySelectedSessionId,
      onDetachSelectedSession,
      onForkSelectedSession,
      onOpenNewWindow,
      onPickDirectory,
      onRenameSelectedSession,
      onRewindSelectedSession,
      pluginAppCommands,
      pluginSessionCommands,
      selectedLiveSession,
      selectedSession,
      selectedSessionId,
    })
  }, [
    liveSessionStore,
    onAttachSelectedSession,
    onCompactSelectedSession,
    onCopySelectedSessionId,
    onDetachSelectedSession,
    onForkSelectedSession,
    onOpenNewWindow,
    onPickDirectory,
    onRenameSelectedSession,
    onRewindSelectedSession,
    pluginCapabilityStore,
    pluginHostStore,
    sessionStore,
  ])

  return {
    closePalette,
    getCommands,
    handleSessionSelection,
    openPalette,
  }
}
