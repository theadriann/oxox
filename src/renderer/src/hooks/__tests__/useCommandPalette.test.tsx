// @vitest-environment jsdom

import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import type { LiveSessionSnapshot, SessionRecord } from '../../../../../shared/ipc/contracts'
import type {
  PluginCapabilityRecord,
  PluginHostSnapshot,
} from '../../../../../shared/plugins/contracts'
import { LiveSessionStore } from '../../stores/LiveSessionStore'
import { PluginCapabilityStore } from '../../stores/PluginCapabilityStore'
import { PluginHostStore } from '../../stores/PluginHostStore'
import { SessionStore } from '../../stores/SessionStore'
import { createStoreEventBus } from '../../stores/storeEventBus'
import { UIStore } from '../../stores/UIStore'
import { useCommandPalette } from '../useCommandPalette'

function createSessionRecord(overrides: Partial<SessionRecord> = {}): SessionRecord {
  return {
    id: 'session-alpha',
    projectId: 'project-alpha',
    projectWorkspacePath: '/tmp/project-alpha',
    projectDisplayName: null,
    modelId: 'gpt-5.4',
    title: 'Alpha session',
    status: 'active',
    transport: 'artifacts',
    createdAt: '2026-03-25T00:00:00.000Z',
    lastActivityAt: '2026-03-25T00:00:00.000Z',
    updatedAt: '2026-03-25T00:00:00.000Z',
    ...overrides,
  }
}

function createSnapshot(overrides: Partial<LiveSessionSnapshot> = {}): LiveSessionSnapshot {
  return {
    sessionId: 'session-alpha',
    title: 'Alpha session',
    status: 'active',
    transport: 'stream-jsonrpc',
    processId: 42,
    viewerCount: 1,
    projectWorkspacePath: '/tmp/project-alpha',
    parentSessionId: null,
    availableModels: [{ id: 'gpt-5.4', name: 'GPT 5.4' }],
    settings: {
      modelId: 'gpt-5.4',
      interactionMode: 'auto',
    },
    messages: [],
    events: [],
    ...overrides,
  }
}

function createPluginCapability(
  overrides: Partial<PluginCapabilityRecord> = {},
): PluginCapabilityRecord {
  return {
    qualifiedId: 'plugin.example:summarize',
    pluginId: 'plugin.example',
    kind: 'session-action',
    name: 'summarize',
    displayName: 'Summarize Session',
    ...overrides,
  }
}

function createPluginHostSnapshot(overrides: Partial<PluginHostSnapshot> = {}): PluginHostSnapshot {
  return {
    pluginId: 'plugin.example',
    processId: 4242,
    status: 'running',
    lastError: null,
    ...overrides,
  }
}

function CommandPaletteProbe({
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
}: {
  sessionStore: SessionStore
  liveSessionStore: LiveSessionStore
  pluginCapabilityStore: PluginCapabilityStore
  pluginHostStore: PluginHostStore
  uiStore: UIStore
  onPickDirectory: () => void
  onOpenNewWindow: () => void
  onAttachSelectedSession: () => void
  onDetachSelectedSession: () => void
  onCopySelectedSessionId: () => void
  onCompactSelectedSession: () => void
  onForkSelectedSession: () => void
  onRenameSelectedSession: () => void
  onRewindSelectedSession: () => void
  onFocusTranscriptPrimaryAction: () => void
}) {
  const { closePalette, commands, handleSessionSelection, openPalette } = useCommandPalette({
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
  })

  return (
    <div>
      <button onClick={openPalette} type="button">
        Open palette
      </button>
      <button onClick={closePalette} type="button">
        Close palette
      </button>
      <button onClick={() => handleSessionSelection('session-beta')} type="button">
        Select session beta
      </button>
      <ul>
        {commands.map((command) => (
          <li key={command.id}>{command.label}</li>
        ))}
      </ul>
    </div>
  )
}

describe('useCommandPalette', () => {
  it('builds contextual commands for the selected session', async () => {
    const sessionStore = new SessionStore()
    const bus = createStoreEventBus()
    const liveSessionStore = new LiveSessionStore(
      () => sessionStore.selectedSessionId || null,
      bus,
      async () => null,
      (sessionId) => sessionStore.sessions.find((session) => session.id === sessionId),
    )
    const pluginCapabilityStore = new PluginCapabilityStore(
      vi.fn().mockResolvedValue([
        createPluginCapability({
          qualifiedId: 'plugin.example:open-dashboard',
          kind: 'app-action',
          name: 'open-dashboard',
          displayName: 'Open Plugin Dashboard',
        }),
        createPluginCapability(),
      ]),
      vi.fn(),
    )
    const pluginHostStore = new PluginHostStore(
      vi.fn().mockResolvedValue([createPluginHostSnapshot()]),
    )
    const uiStore = new UIStore()

    sessionStore.hydrateSessions([
      createSessionRecord(),
      createSessionRecord({
        id: 'session-beta',
        title: 'Beta session',
        projectId: 'project-beta',
        projectWorkspacePath: '/tmp/project-beta',
      }),
    ])
    sessionStore.selectSession('session-alpha')

    await pluginCapabilityStore.refresh()
    await pluginHostStore.refresh()

    render(
      <CommandPaletteProbe
        sessionStore={sessionStore}
        liveSessionStore={liveSessionStore}
        pluginCapabilityStore={pluginCapabilityStore}
        pluginHostStore={pluginHostStore}
        uiStore={uiStore}
        onPickDirectory={vi.fn()}
        onOpenNewWindow={vi.fn()}
        onAttachSelectedSession={vi.fn()}
        onDetachSelectedSession={vi.fn()}
        onCopySelectedSessionId={vi.fn()}
        onCompactSelectedSession={vi.fn()}
        onForkSelectedSession={vi.fn()}
        onRenameSelectedSession={vi.fn()}
        onRewindSelectedSession={vi.fn()}
        onFocusTranscriptPrimaryAction={vi.fn()}
      />,
    )

    expect(screen.getByText('New Session')).toBeTruthy()
    expect(screen.getByText('Search Sessions')).toBeTruthy()
    expect(screen.getByText('Open New Window')).toBeTruthy()
    expect(screen.getByText('Open Plugin Dashboard')).toBeTruthy()
    expect(screen.getByText('Summarize Session')).toBeTruthy()
    expect(screen.getByText('Attach to Session')).toBeTruthy()
    expect(screen.getByText('Copy Session ID')).toBeTruthy()
    expect(screen.getByText('Compact Session')).toBeTruthy()
    expect(screen.getByText('Fork Session')).toBeTruthy()
    expect(screen.getByText('Rename Session')).toBeTruthy()
    expect(screen.getByText('Rewind Session')).toBeTruthy()
  })

  it('selects a session and restores focus to the transcript target when the palette closes', async () => {
    const sessionStore = new SessionStore()
    const bus = createStoreEventBus()
    const liveSessionStore = new LiveSessionStore(
      () => sessionStore.selectedSessionId || null,
      bus,
      async () => null,
      (sessionId) => sessionStore.sessions.find((session) => session.id === sessionId),
    )
    const pluginCapabilityStore = new PluginCapabilityStore(vi.fn().mockResolvedValue([]), vi.fn())
    const pluginHostStore = new PluginHostStore(vi.fn().mockResolvedValue([]))
    const uiStore = new UIStore()
    const focusTranscriptPrimaryAction = vi.fn(() => {
      document.getElementById('transcript-target')?.focus()
    })

    sessionStore.hydrateSessions([
      createSessionRecord(),
      createSessionRecord({
        id: 'session-beta',
        title: 'Beta session',
        projectId: 'project-beta',
        projectWorkspacePath: '/tmp/project-beta',
      }),
    ])
    liveSessionStore.upsertSnapshot(createSnapshot())

    render(
      <div>
        <button id="palette-trigger" type="button">
          Palette trigger
        </button>
        <button id="transcript-target" type="button">
          Transcript target
        </button>
        <CommandPaletteProbe
          sessionStore={sessionStore}
          liveSessionStore={liveSessionStore}
          pluginCapabilityStore={pluginCapabilityStore}
          pluginHostStore={pluginHostStore}
          uiStore={uiStore}
          onPickDirectory={vi.fn()}
          onOpenNewWindow={vi.fn()}
          onAttachSelectedSession={vi.fn()}
          onDetachSelectedSession={vi.fn()}
          onCopySelectedSessionId={vi.fn()}
          onCompactSelectedSession={vi.fn()}
          onForkSelectedSession={vi.fn()}
          onRenameSelectedSession={vi.fn()}
          onRewindSelectedSession={vi.fn()}
          onFocusTranscriptPrimaryAction={focusTranscriptPrimaryAction}
        />
      </div>,
    )

    const paletteTrigger = screen.getByRole('button', { name: /palette trigger/i })
    paletteTrigger.focus()

    fireEvent.click(screen.getByRole('button', { name: /open palette/i }))

    fireEvent.click(screen.getByRole('button', { name: /select session beta/i }))

    expect(sessionStore.selectedSessionId).toBe('session-beta')

    fireEvent.click(screen.getByRole('button', { name: /close palette/i }))

    await waitFor(() => {
      expect(document.activeElement).toBe(
        screen.getByRole('button', { name: /transcript target/i }),
      )
    })
    expect(focusTranscriptPrimaryAction).toHaveBeenCalledTimes(1)
  })
})
