// @vitest-environment jsdom

import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import type { LiveSessionSnapshot, SessionRecord } from '../../../../../shared/ipc/contracts'
import { type ComposerSessionGateway, ComposerStore } from '../../stores/ComposerStore'
import { FoundationStore, PLACEHOLDER_FOUNDATION } from '../../stores/FoundationStore'
import { LiveSessionStore } from '../../stores/LiveSessionStore'
import { SessionStore } from '../../stores/SessionStore'
import { createStoreEventBus } from '../../stores/storeEventBus'
import { TransportStore } from '../../stores/TransportStore'
import { useNewSessionForm } from '../useNewSessionForm'

function createSessionRecord(overrides: Partial<SessionRecord> = {}): SessionRecord {
  return {
    id: 'session-existing',
    projectId: 'project-existing',
    projectWorkspacePath: '/tmp/existing',
    projectDisplayName: null,
    title: 'Existing session',
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
    sessionId: 'session-live-1',
    title: 'Fresh live session',
    status: 'active',
    transport: 'stream-jsonrpc',
    processId: 42,
    viewerCount: 1,
    projectWorkspacePath: '/tmp/workspace',
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

function createStores() {
  const bus = createStoreEventBus()
  const sessionStore = new SessionStore()
  const transportStore = new TransportStore()
  sessionStore.connectToEventBus(bus)
  transportStore.connectToEventBus(bus)
  const foundationStore = new FoundationStore(bus)
  foundationStore.foundation = {
    ...PLACEHOLDER_FOUNDATION,
    factoryModels: [{ id: 'gpt-5.4', name: 'GPT 5.4' }],
    factoryDefaultSettings: {
      model: 'gpt-5.4',
      interactionMode: 'auto',
    },
  }
  const liveSessionStore = new LiveSessionStore(
    () => sessionStore.selectedSessionId || null,
    bus,
    async () => null,
    (sessionId) => sessionStore.sessions.find((session) => session.id === sessionId),
  )
  const sessionApi: ComposerSessionGateway = {
    create: vi.fn().mockResolvedValue(createSnapshot()),
    updateSettings: vi.fn().mockResolvedValue(undefined),
    addUserMessage: vi.fn().mockResolvedValue(undefined),
    getSnapshot: vi.fn().mockResolvedValue(createSnapshot()),
  }
  const composerStore = new ComposerStore(
    sessionStore,
    liveSessionStore,
    foundationStore,
    sessionApi,
  )

  sessionStore.hydrateSessions([createSessionRecord()])

  return {
    sessionStore,
    liveSessionStore,
    composerStore,
    sessionApi,
  }
}

type NewSessionFormProbeProps = ReturnType<typeof createStores> & {
  dialogApi: {
    selectDirectory?: () => Promise<string | null>
  }
  sessionApi: {
    create?: (cwd: string) => Promise<LiveSessionSnapshot>
    updateSettings?: (
      sessionId: string,
      settings: { modelId?: string; interactionMode?: string; autonomyLevel?: string },
    ) => Promise<void>
    addUserMessage?: (sessionId: string, text: string) => Promise<void>
    getSnapshot?: (sessionId: string) => Promise<LiveSessionSnapshot | null>
  }
}

function NewSessionFormProbe({
  sessionStore,
  liveSessionStore,
  composerStore,
  dialogApi,
  sessionApi,
}: NewSessionFormProbeProps) {
  const form = useNewSessionForm({
    sessionStore,
    liveSessionStore,
    composerStore,
    dialogApi,
    sessionApi,
  })

  return (
    <div>
      <button onClick={() => void form.openDraft()} type="button">
        Open draft
      </button>
      <button onClick={() => void form.pickDirectory()} type="button">
        Choose workspace
      </button>
      <button
        onClick={() =>
          void form.submitNewSession({
            text: 'Reply with HELLO_HOOK',
            modelId: 'gpt-5.4',
            interactionMode: 'auto',
            autonomyLevel: 'medium',
          })
        }
        type="button"
      >
        Submit session
      </button>
      <button onClick={form.closeForm} type="button">
        Close form
      </button>
      <output data-testid="show-form">{String(form.showForm)}</output>
      <output data-testid="workspace-path">{form.path}</output>
      <output data-testid="form-error">{form.error ?? ''}</output>
      <output data-testid="is-submitting">{String(form.isSubmitting)}</output>
    </div>
  )
}

describe('useNewSessionForm', () => {
  it('opens the draft first, then stores the selected path when the picker runs', async () => {
    const stores = createStores()
    const selectDirectory = vi.fn().mockResolvedValue('/tmp/workspace')
    Reflect.deleteProperty(window, 'oxox')

    render(
      <NewSessionFormProbe
        {...stores}
        dialogApi={{ selectDirectory }}
        sessionApi={stores.sessionApi}
      />,
    )

    const trigger = screen.getByRole('button', { name: /open draft/i })
    trigger.focus()

    fireEvent.click(trigger)

    await waitFor(() => {
      expect(screen.getByTestId('show-form').textContent).toBe('true')
    })
    expect(selectDirectory).not.toHaveBeenCalled()
    expect(screen.getByTestId('workspace-path').textContent).toBe('')

    fireEvent.click(screen.getByRole('button', { name: /choose workspace/i }))

    await waitFor(() => {
      expect(selectDirectory).toHaveBeenCalledTimes(1)
    })
    expect(screen.getByTestId('workspace-path').textContent).toBe('/tmp/workspace')

    fireEvent.click(screen.getByRole('button', { name: /close form/i }))

    await waitFor(() => {
      expect(document.activeElement).toBe(trigger)
    })
    expect(screen.getByTestId('show-form').textContent).toBe('false')
  })

  it('creates a session, selects it, and refreshes the live snapshot', async () => {
    const stores = createStores()
    const create = vi.fn().mockResolvedValue(createSnapshot())
    const updateSettings = vi.fn().mockResolvedValue(undefined)
    const addUserMessage = vi.fn().mockResolvedValue(undefined)
    const getSnapshot = vi.fn().mockResolvedValue(createSnapshot())
    const selectDirectory = vi.fn().mockResolvedValue('/tmp/workspace')
    Reflect.deleteProperty(window, 'oxox')

    render(
      <NewSessionFormProbe
        {...stores}
        dialogApi={{ selectDirectory }}
        sessionApi={{
          create,
          updateSettings,
          addUserMessage,
          getSnapshot,
        }}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: /open draft/i }))
    fireEvent.click(screen.getByRole('button', { name: /choose workspace/i }))
    await waitFor(() => {
      expect(screen.getByTestId('workspace-path').textContent).toBe('/tmp/workspace')
    })

    fireEvent.click(screen.getByRole('button', { name: /submit session/i }))

    await waitFor(() => {
      expect(stores.sessionStore.selectedSessionId).toBe('session-live-1')
    })

    expect(create).toHaveBeenCalledWith('/tmp/workspace')
    expect(updateSettings).toHaveBeenCalledWith('session-live-1', {
      modelId: 'gpt-5.4',
      interactionMode: 'auto',
      autonomyLevel: 'medium',
    })
    expect(addUserMessage).toHaveBeenCalledWith('session-live-1', 'Reply with HELLO_HOOK')
    expect(getSnapshot).toHaveBeenCalledWith('session-live-1')
    expect(stores.liveSessionStore.selectedSnapshot?.sessionId).toBe('session-live-1')
    expect(screen.getByTestId('show-form').textContent).toBe('false')
    expect(screen.getByTestId('is-submitting').textContent).toBe('false')
  })
})
