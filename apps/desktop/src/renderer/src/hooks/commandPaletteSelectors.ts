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

import type { CommandPaletteAction } from '../components/command-palette/CommandPalette'

interface BuildCommandPaletteActionsOptions {
  canAttachSelectedSession: boolean
  onAttachSelectedSession: () => void | Promise<void>
  onCompactSelectedSession: () => void | Promise<void>
  onCopySelectedSessionId: () => void | Promise<void>
  onDetachSelectedSession: () => void | Promise<void>
  onForkSelectedSession: () => void | Promise<void>
  onOpenNewWindow: () => void | Promise<void>
  onPickDirectory: () => void | Promise<void>
  onRenameSelectedSession: () => void | Promise<void>
  onRewindSelectedSession: () => void | Promise<void>
  pluginAppCommands: CommandPaletteAction[]
  pluginSessionCommands: CommandPaletteAction[]
  selectedLiveSession: unknown
  selectedSession: { status?: string } | undefined
  selectedSessionId: string
}

export function buildCommandPaletteActions({
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
}: BuildCommandPaletteActionsOptions): CommandPaletteAction[] {
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
    ...pluginAppCommands,
  ]

  if (!selectedSessionId || (!selectedSession && !selectedLiveSession)) {
    return globalCommands
  }

  const selectedSessionCommands: CommandPaletteAction[] = []

  if (selectedLiveSession) {
    selectedSessionCommands.push({
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
    selectedSessionCommands.push({
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

  return [
    ...globalCommands,
    ...pluginSessionCommands,
    ...selectedSessionCommands,
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
  ]
}
