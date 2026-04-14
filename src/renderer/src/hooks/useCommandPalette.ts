import {
  Copy,
  GitBranch,
  Minimize2,
  PanelLeftClose,
  PanelLeftOpen,
  RotateCcw,
  Search,
  Sparkles,
} from 'lucide-react'
import { useCallback, useMemo, useRef } from 'react'

import type { CommandPaletteAction } from '../components/command-palette/CommandPalette'
import type { LiveSessionStore } from '../stores/LiveSessionStore'
import type { PluginCapabilityStore } from '../stores/PluginCapabilityStore'
import type { PluginHostStore } from '../stores/PluginHostStore'
import type { SessionStore } from '../stores/SessionStore'
import type { UIStore } from '../stores/UIStore'

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
  commands: CommandPaletteAction[]
  closePalette: () => void
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

  const selectedSession = sessionStore.selectedSession
  const selectedSessionId = sessionStore.selectedSessionId
  const selectedLiveSession = liveSessionStore.selectedSnapshot
  const runningPluginIds = useMemo(
    () => new Set(pluginHostStore.runningHosts.map((host) => host.pluginId)),
    [pluginHostStore.runningHosts],
  )
  const canAttachSelectedSession = Boolean(
    selectedSessionId &&
      selectedSession?.status !== 'completed' &&
      (!selectedLiveSession || liveSessionStore.selectedNeedsReconnect),
  )

  const commands = useMemo<CommandPaletteAction[]>(() => {
    const globalCommands: CommandPaletteAction[] = [
      {
        id: 'new-session',
        label: 'New Session',
        description: 'Pick a workspace and draft the first message in the composer.',
        keywords: ['create', 'new sess', 'workspace'],
        icon: Sparkles,
        onSelect: () => {
          void onPickDirectory()
        },
      },
      {
        id: 'search-sessions',
        label: 'Search Sessions',
        description: 'Start typing to jump to an indexed session transcript.',
        keywords: ['find', 'jump', 'lookup'],
        icon: Search,
        closeOnSelect: false,
        onSelect: () => undefined,
      },
      {
        id: 'open-new-window',
        label: 'Open New Window',
        description: 'Open a full independent OXOX window with its own sidebar and content area.',
        keywords: ['window', 'cmd+n', 'multi-window'],
        icon: PanelLeftOpen,
        onSelect: () => {
          void onOpenNewWindow()
        },
      },
    ]

    const pluginCommands: CommandPaletteAction[] = pluginCapabilityStore.appActions.map(
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

    if (!selectedSessionId || (!selectedSession && !selectedLiveSession)) {
      return [...globalCommands, ...pluginCommands]
    }

    const sessionCommands: CommandPaletteAction[] = []

    if (selectedLiveSession) {
      sessionCommands.push({
        id: 'detach-session',
        label: 'Detach from Session',
        description: 'Disconnect this window while leaving the droid process running.',
        keywords: ['disconnect', 'detach', 'session'],
        icon: PanelLeftClose,
        onSelect: () => {
          void onDetachSelectedSession()
        },
      })
    } else if (canAttachSelectedSession) {
      sessionCommands.push({
        id: 'attach-session',
        label: 'Attach to Session',
        description: 'Reconnect to the selected session and resume live controls.',
        keywords: ['attach', 'reconnect', 'session'],
        icon: Sparkles,
        onSelect: () => {
          void onAttachSelectedSession()
        },
      })
    }

    sessionCommands.push(
      ...pluginCapabilityStore.sessionActions.map((capability) => ({
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
      })),
      {
        id: 'copy-session-id',
        label: 'Copy Session ID',
        description: `Copy ${selectedSessionId} to the clipboard.`,
        keywords: ['copy', 'clipboard', 'identifier'],
        icon: Copy,
        onSelect: () => {
          void onCopySelectedSessionId()
        },
      },
      {
        id: 'rename-session',
        label: 'Rename Session',
        description: 'Rename the selected session through the Factory daemon.',
        keywords: ['rename', 'title', 'session'],
        icon: Sparkles,
        onSelect: () => {
          void onRenameSelectedSession()
        },
      },
      {
        id: 'compact-session',
        label: 'Compact Session',
        description: 'Manually compact the selected session into a new live session.',
        keywords: ['compact', 'compress', 'summarize', 'session'],
        icon: Minimize2,
        onSelect: () => {
          void onCompactSelectedSession()
        },
      },
      {
        id: 'rewind-session',
        label: 'Rewind Session',
        description: 'Choose a message, review affected files, and create a rewind fork.',
        keywords: ['rewind', 'restore', 'files', 'branch'],
        icon: RotateCcw,
        onSelect: () => {
          void onRewindSelectedSession()
        },
      },
      {
        id: 'fork-session',
        label: 'Fork Session',
        description: 'Create a new live session with the current transcript history.',
        keywords: ['fork', 'duplicate', 'branch'],
        icon: GitBranch,
        onSelect: () => {
          void onForkSelectedSession()
        },
      },
    )

    return [...globalCommands, ...pluginCommands, ...sessionCommands]
  }, [
    canAttachSelectedSession,
    onAttachSelectedSession,
    onCompactSelectedSession,
    onCopySelectedSessionId,
    onDetachSelectedSession,
    onForkSelectedSession,
    onRenameSelectedSession,
    onRewindSelectedSession,
    onOpenNewWindow,
    onPickDirectory,
    pluginCapabilityStore,
    runningPluginIds,
    selectedLiveSession,
    selectedSession,
    selectedSessionId,
  ])

  return {
    closePalette,
    commands,
    handleSessionSelection,
    openPalette,
  }
}
