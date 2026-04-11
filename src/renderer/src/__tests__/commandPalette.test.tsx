// @vitest-environment jsdom

import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'

import App from '../App'
import { createPlatformApiClient } from '../platform/apiClient'
import { RootStore } from '../stores/RootStore'
import { StoreProvider } from '../stores/StoreProvider'

const RUNTIME_INFO = {
  appVersion: '0.1.0',
  chromeVersion: '136.0.0.0',
  electronVersion: '41.0.3',
  nodeVersion: '24.11.1',
  platform: 'darwin' as const,
  isDarkModeForced: true,
  hasRequire: false,
  hasProcess: false,
}

function createBootstrap(overrides: Record<string, unknown> = {}) {
  return {
    database: {
      exists: true,
      journalMode: 'wal',
      path: '/tmp/oxox.db',
      tableNames: ['projects', 'sessions', 'sync_metadata'],
    },
    droidCli: {
      available: true,
      path: '/Users/test/.local/bin/droid',
      version: 'droid 0.84.0',
      searchedLocations: ['/Users/test/.local/bin/droid'],
      error: null,
    },
    daemon: {
      status: 'connected',
      connectedPort: 37643,
      lastError: null,
      lastConnectedAt: '2026-03-24T23:41:00.000Z',
      lastSyncAt: '2026-03-24T23:41:01.000Z',
      nextRetryDelayMs: null,
    },
    projects: [],
    sessions: [],
    syncMetadata: [],
    factoryModels: [],
    factoryDefaultSettings: {},
    ...overrides,
  }
}

function createLiveSnapshot(overrides: Record<string, unknown> = {}) {
  return {
    sessionId: 'session-live-1',
    title: 'Untitled session',
    status: 'active',
    transport: 'stream-jsonrpc',
    processId: 4242,
    viewerCount: 1,
    projectWorkspacePath: '/tmp/live-session',
    parentSessionId: null,
    availableModels: [
      { id: 'gpt-5.4', name: 'GPT 5.4' },
      { id: 'gpt-5.4-mini', name: 'GPT 5.4 Mini' },
    ],
    settings: {
      modelId: 'gpt-5.4',
      interactionMode: 'auto',
    },
    messages: [],
    events: [],
    ...overrides,
  }
}

function createPluginCapability(overrides: Record<string, unknown> = {}) {
  return {
    qualifiedId: 'plugin.example:summarize',
    pluginId: 'plugin.example',
    kind: 'session-action',
    name: 'summarize',
    displayName: 'Summarize Session',
    ...overrides,
  }
}

function createPluginHostSnapshot(overrides: Record<string, unknown> = {}) {
  return {
    pluginId: 'plugin.example',
    processId: 4242,
    status: 'running',
    lastError: null,
    ...overrides,
  }
}

function mockBridge(bootstrap: unknown) {
  window.oxox = {
    runtime: {
      getInfo: vi.fn().mockResolvedValue(RUNTIME_INFO),
    },
    app: {
      onNotificationNavigation: vi.fn(),
      openNewWindow: vi.fn().mockResolvedValue(undefined),
    },
    plugin: {
      listCapabilities: vi.fn().mockResolvedValue([]),
      listHosts: vi.fn().mockResolvedValue([]),
      invokeCapability: vi.fn(),
      onCapabilitiesChanged: vi.fn(),
      onHostChanged: vi.fn(),
    },
    foundation: {
      getBootstrap: vi.fn().mockResolvedValue(bootstrap),
    },
    database: {
      listProjects: vi.fn().mockResolvedValue([]),
      listSessions: vi.fn().mockResolvedValue([]),
      listSyncMetadata: vi.fn().mockResolvedValue([]),
    },
    transcript: {
      getSessionTranscript: vi.fn().mockRejectedValue(new Error('Transcript unavailable')),
    },
    dialog: {
      selectDirectory: vi.fn().mockResolvedValue(null),
    },
    session: {
      create: vi.fn().mockResolvedValue(createLiveSnapshot()),
      getSnapshot: vi.fn().mockResolvedValue(createLiveSnapshot()),
      attach: vi.fn().mockResolvedValue(createLiveSnapshot()),
      detach: vi.fn().mockResolvedValue(createLiveSnapshot()),
      addUserMessage: vi.fn().mockResolvedValue(undefined),
      updateSettings: vi.fn().mockResolvedValue(undefined),
      interrupt: vi.fn().mockResolvedValue(undefined),
      fork: vi.fn().mockResolvedValue(createLiveSnapshot({ sessionId: 'session-live-fork-1' })),
    },
  }
}

function createSessionsBootstrap() {
  return createBootstrap({
    sessions: [
      {
        id: 'session-beta',
        projectId: 'project-beta',
        projectWorkspacePath: '/tmp/project-beta',
        projectDisplayName: null,
        title: 'Beta wrap verification',
        status: 'active',
        transport: 'artifacts',
        createdAt: '2026-03-24T23:35:00.000Z',
        lastActivityAt: '2026-03-25T00:05:00.000Z',
        updatedAt: '2026-03-25T00:05:00.000Z',
      },
      {
        id: 'session-alpha',
        projectId: 'project-alpha',
        projectWorkspacePath: '/tmp/project-alpha',
        projectDisplayName: null,
        title: 'Alpha session review',
        status: 'completed',
        transport: 'artifacts',
        createdAt: '2026-03-24T23:30:00.000Z',
        lastActivityAt: '2026-03-24T23:55:00.000Z',
        updatedAt: '2026-03-24T23:55:00.000Z',
      },
    ],
  })
}

function createRootStore(bootstrap: unknown, overrides: Record<string, unknown> = {}) {
  return new RootStore(
    createPlatformApiClient({
      oxox: {
        runtime: {
          getInfo: vi.fn().mockResolvedValue(RUNTIME_INFO),
        },
        app: {
          onNotificationNavigation: vi.fn(),
          openNewWindow: vi.fn().mockResolvedValue(undefined),
        },
        plugin: {
          listCapabilities: vi.fn().mockResolvedValue([]),
          listHosts: vi.fn().mockResolvedValue([]),
          invokeCapability: vi.fn(),
          onCapabilitiesChanged: vi.fn(),
          onHostChanged: vi.fn(),
          ...((overrides.plugin as Record<string, unknown> | undefined) ?? {}),
        },
        foundation: {
          getBootstrap: vi.fn().mockResolvedValue(bootstrap),
        },
        database: {
          listProjects: vi.fn().mockResolvedValue([]),
          listSessions: vi.fn().mockResolvedValue([]),
          listSyncMetadata: vi.fn().mockResolvedValue([]),
        },
        transcript: {
          getSessionTranscript: vi.fn().mockRejectedValue(new Error('Transcript unavailable')),
        },
        dialog: {
          selectDirectory: vi.fn().mockResolvedValue(null),
        },
        session: {
          create: vi.fn().mockResolvedValue(createLiveSnapshot()),
          getSnapshot: vi.fn().mockResolvedValue(createLiveSnapshot()),
          attach: vi.fn().mockResolvedValue(createLiveSnapshot()),
          detach: vi.fn().mockResolvedValue(createLiveSnapshot()),
          addUserMessage: vi.fn().mockResolvedValue(undefined),
          updateSettings: vi.fn().mockResolvedValue(undefined),
          interrupt: vi.fn().mockResolvedValue(undefined),
          fork: vi.fn().mockResolvedValue(createLiveSnapshot({ sessionId: 'session-live-fork-1' })),
          ...((overrides.session as Record<string, unknown> | undefined) ?? {}),
        },
        ...overrides,
      } as never,
    }),
  )
}

function renderAppWithSessions(rootStore?: RootStore) {
  if (!rootStore) {
    mockBridge(createSessionsBootstrap())
  }

  return render(
    <StoreProvider rootStore={rootStore}>
      <App />
    </StoreProvider>,
  )
}

function renderAppWithDuplicateSessionTitles() {
  mockBridge(
    createBootstrap({
      sessions: [
        {
          id: 'session-untitled-alpha',
          projectId: 'project-alpha',
          projectWorkspacePath: '/tmp/project-alpha',
          projectDisplayName: null,
          title: 'Untitled session',
          status: 'active',
          transport: 'artifacts',
          createdAt: '2026-03-24T23:30:00.000Z',
          lastActivityAt: '2026-03-25T00:05:00.000Z',
          updatedAt: '2026-03-25T00:05:00.000Z',
        },
        {
          id: 'session-untitled-gamma',
          projectId: 'project-gamma',
          projectWorkspacePath: '/tmp/project-gamma',
          projectDisplayName: null,
          title: 'Untitled session',
          status: 'waiting',
          transport: 'artifacts',
          createdAt: '2026-03-24T23:20:00.000Z',
          lastActivityAt: '2026-03-24T23:55:00.000Z',
          updatedAt: '2026-03-24T23:55:00.000Z',
        },
      ],
    }),
  )

  return render(
    <StoreProvider>
      <App />
    </StoreProvider>,
  )
}

function renderAppWithNoSessions() {
  mockBridge(createBootstrap())

  return render(
    <StoreProvider>
      <App />
    </StoreProvider>,
  )
}

function renderAppWithSingleSession() {
  mockBridge(
    createBootstrap({
      sessions: [
        {
          id: 'session-alpha',
          projectId: 'project-alpha',
          projectWorkspacePath: '/tmp/project-alpha',
          projectDisplayName: null,
          title: 'Alpha session review',
          status: 'active',
          transport: 'artifacts',
          createdAt: '2026-03-24T23:30:00.000Z',
          lastActivityAt: '2026-03-24T23:55:00.000Z',
          updatedAt: '2026-03-24T23:55:00.000Z',
        },
      ],
    }),
  )

  return render(
    <StoreProvider>
      <App />
    </StoreProvider>,
  )
}

async function openCommandPalette() {
  fireEvent.keyDown(window, { key: 'k', metaKey: true })
  return screen.findByRole('dialog', { name: /command palette/i })
}

describe('command palette core', () => {
  beforeEach(() => {
    window.localStorage.clear()
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: {
        writeText: vi.fn().mockResolvedValue(undefined),
      },
    })
    class ResizeObserverMock {
      observe() {}
      unobserve() {}
      disconnect() {}
    }

    vi.stubGlobal('ResizeObserver', ResizeObserverMock)
    Element.prototype.scrollIntoView = vi.fn()
    HTMLElement.prototype.scrollTo = vi.fn()
    Object.defineProperty(window, 'innerWidth', {
      configurable: true,
      value: 1200,
    })
  })

  it('opens from Cmd+K with a focused input, restores focus on Escape, and dismisses on outside click', async () => {
    renderAppWithSessions()

    const previousFocusTarget = (await screen.findAllByRole('button', { name: /Hide sidebar/i }))[0]
    previousFocusTarget.focus()

    const dialog = await openCommandPalette()
    const input = screen.getByLabelText(/Search commands and sessions/i)

    expect(dialog).toBeTruthy()
    expect(document.activeElement).toBe(input)

    fireEvent.keyDown(input, { key: 'Escape' })

    expect(screen.queryByRole('dialog', { name: /command palette/i })).toBeNull()
    await waitFor(() => {
      expect(document.activeElement).toBe(previousFocusTarget)
    })

    await openCommandPalette()
    const overlay = document.querySelector('[cmdk-overlay]')
    expect(overlay).toBeTruthy()
    fireEvent.pointerDown(overlay as Element)

    expect(screen.queryByRole('dialog', { name: /command palette/i })).toBeNull()
  })

  it('shows default commands for an empty query and filters ranked fuzzy matches while typing', async () => {
    renderAppWithSessions()

    const dialog = await openCommandPalette()
    const palette = within(dialog)
    const input = screen.getByLabelText(/Search commands and sessions/i)

    expect(palette.getByText('New Session')).toBeTruthy()
    expect(palette.getByText('Search Sessions')).toBeTruthy()
    expect(palette.getByText('Open New Window')).toBeTruthy()
    expect(palette.queryByText('Alpha session review')).toBeNull()

    fireEvent.change(input, { target: { value: 'new sess' } })

    const selectedCommand = palette.getByText('New Session').closest('[data-selected="true"]')
    expect(selectedCommand?.textContent).toContain('New Session')
    expect(palette.queryByText('Search Sessions')).toBeNull()

    fireEvent.change(input, { target: { value: 'alpha' } })

    expect(palette.getByText('Alpha session review')).toBeTruthy()
    expect(palette.queryByText('Beta wrap verification')).toBeNull()
  })

  it('wraps keyboard navigation and executes the highlighted command on Enter', async () => {
    renderAppWithSessions()

    const dialog = await openCommandPalette()
    const input = screen.getByLabelText(/Search commands and sessions/i)
    fireEvent.keyDown(input, { key: 'ArrowUp' })
    let selectedItem = dialog.querySelector('[cmdk-item][data-selected="true"]')
    expect(selectedItem?.textContent).toContain('Fork Session')
    fireEvent.keyDown(input, { key: 'ArrowDown' })
    selectedItem = dialog.querySelector('[cmdk-item][data-selected="true"]')
    expect(selectedItem?.textContent).toContain('New Session')
    fireEvent.keyDown(input, { key: 'Enter' })

    expect(await screen.findByText(/Workspace directory/i)).toBeTruthy()
    expect(screen.queryByLabelText(/Initial prompt/i)).toBeNull()
    expect(screen.queryByRole('dialog', { name: /command palette/i })).toBeNull()
  })

  it('executes the open-new-window command from the palette', async () => {
    Reflect.deleteProperty(window, 'oxox')
    const openNewWindow = vi.fn().mockResolvedValue(undefined)
    const rootStore = createRootStore(createSessionsBootstrap(), {
      app: {
        onNotificationNavigation: vi.fn(),
        openNewWindow,
      },
    })

    renderAppWithSessions(rootStore)

    const dialog = await openCommandPalette()
    const input = screen.getByLabelText(/Search commands and sessions/i)

    fireEvent.change(input, { target: { value: 'new window' } })
    fireEvent.click(within(dialog).getByText('Open New Window'))

    await waitFor(() => {
      expect(openNewWindow).toHaveBeenCalledTimes(1)
    })
    expect(screen.queryByRole('dialog', { name: /command palette/i })).toBeNull()
  })

  it('shows running plugin capability commands and invokes the selected session action', async () => {
    Reflect.deleteProperty(window, 'oxox')
    const invokeCapability = vi.fn().mockResolvedValue({
      capabilityId: 'plugin.example:summarize',
      payload: { summary: 'Done' },
    })
    const rootStore = createRootStore(
      createBootstrap({
        sessions: [
          {
            id: 'session-alpha',
            projectId: 'project-alpha',
            projectWorkspacePath: '/tmp/project-alpha',
            projectDisplayName: null,
            title: 'Alpha session review',
            status: 'active',
            transport: 'artifacts',
            createdAt: '2026-03-24T23:30:00.000Z',
            lastActivityAt: '2026-03-24T23:55:00.000Z',
            updatedAt: '2026-03-24T23:55:00.000Z',
          },
        ],
      }),
      {
        plugin: {
          listCapabilities: vi.fn().mockResolvedValue([createPluginCapability()]),
          listHosts: vi.fn().mockResolvedValue([createPluginHostSnapshot()]),
          invokeCapability,
          onCapabilitiesChanged: vi.fn(),
          onHostChanged: vi.fn(),
        },
      },
    )

    renderAppWithSessions(rootStore)

    await waitFor(() => {
      expect(rootStore.pluginCapabilityStore.capabilities).toEqual([createPluginCapability()])
    })

    const dialog = await openCommandPalette()
    fireEvent.click(within(dialog).getByText('Summarize Session'))

    await waitFor(() => {
      expect(invokeCapability).toHaveBeenCalledWith('plugin.example:summarize', {
        sessionId: 'session-alpha',
      })
    })
    expect(screen.queryByRole('dialog', { name: /command palette/i })).toBeNull()
  })

  it('refreshes plugin commands after a late plugin capability event during startup', async () => {
    Reflect.deleteProperty(window, 'oxox')
    let capabilitiesChangedListener: ((payload: { refreshedAt: string }) => void) | undefined
    const listCapabilities = vi
      .fn()
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([createPluginCapability()])
    const rootStore = createRootStore(
      createBootstrap({
        sessions: [
          {
            id: 'session-alpha',
            projectId: 'project-alpha',
            projectWorkspacePath: '/tmp/project-alpha',
            projectDisplayName: null,
            title: 'Alpha session review',
            status: 'active',
            transport: 'artifacts',
            createdAt: '2026-03-24T23:30:00.000Z',
            lastActivityAt: '2026-03-24T23:55:00.000Z',
            updatedAt: '2026-03-24T23:55:00.000Z',
          },
        ],
      }),
      {
        plugin: {
          listCapabilities,
          listHosts: vi.fn().mockResolvedValue([createPluginHostSnapshot()]),
          invokeCapability: vi.fn(),
          onCapabilitiesChanged: vi.fn((listener: (payload: { refreshedAt: string }) => void) => {
            capabilitiesChangedListener = listener
            return vi.fn()
          }),
          onHostChanged: vi.fn(),
        },
      },
    )

    renderAppWithSessions(rootStore)

    const initialDialog = await openCommandPalette()
    expect(within(initialDialog).queryByText('Summarize Session')).toBeNull()
    fireEvent.keyDown(screen.getByLabelText(/Search commands and sessions/i), { key: 'Escape' })

    await act(async () => {
      capabilitiesChangedListener?.({ refreshedAt: '2026-04-01T18:00:00.000Z' })
      await Promise.resolve()
    })

    const refreshedDialog = await openCommandPalette()
    expect(within(refreshedDialog).getByText('Summarize Session')).toBeTruthy()
  })

  it('keeps duplicate session titles selectable by keyboard and executes the highlighted session result', async () => {
    renderAppWithDuplicateSessionTitles()

    const dialog = await openCommandPalette()
    const input = screen.getByLabelText(/Search commands and sessions/i)

    fireEvent.change(input, { target: { value: 'untitled' } })
    fireEvent.keyDown(input, { key: 'ArrowDown' })

    const selectedItem = dialog.querySelector('[cmdk-item][data-selected="true"]')
    expect(selectedItem?.textContent).toContain('project-gamma')

    fireEvent.keyDown(input, { key: 'Enter' })

    expect(screen.queryByRole('dialog', { name: /command palette/i })).toBeNull()
    expect((await screen.findAllByText('project-gamma')).length).toBeGreaterThan(0)
  })

  it('shows only global commands on the home view and hides session-specific actions', async () => {
    renderAppWithNoSessions()

    const dialog = await openCommandPalette()
    const palette = within(dialog)

    expect(palette.getByText('New Session')).toBeTruthy()
    expect(palette.getByText('Search Sessions')).toBeTruthy()
    expect(palette.getByText('Open New Window')).toBeTruthy()
    expect(palette.queryByText('Attach to Session')).toBeNull()
    expect(palette.queryByText('Detach from Session')).toBeNull()
    expect(palette.queryByText('Copy Session ID')).toBeNull()
    expect(palette.queryByText('Fork Session')).toBeNull()
  })

  it('shows session actions in session context, copies the session id, and toggles attach/detach commands', async () => {
    renderAppWithSingleSession()

    const initialDialog = await openCommandPalette()
    const initialPalette = within(initialDialog)

    expect(initialPalette.getByText('Attach to Session')).toBeTruthy()
    expect(initialPalette.queryByText('Detach from Session')).toBeNull()
    expect(initialPalette.getByText('Copy Session ID')).toBeTruthy()
    expect(initialPalette.getByText('Fork Session')).toBeTruthy()

    fireEvent.click(initialPalette.getByText('Copy Session ID'))

    await waitFor(() => {
      expect(navigator.clipboard.writeText).toHaveBeenCalledWith('session-alpha')
    })
    expect(await screen.findByText(/Copied session ID “session-alpha”/i)).toBeTruthy()

    const attachMock = window.oxox.session.attach as ReturnType<typeof vi.fn>
    const detachMock = window.oxox.session.detach as ReturnType<typeof vi.fn>
    attachMock.mockResolvedValue(
      createLiveSnapshot({
        sessionId: 'session-alpha',
        title: 'Alpha session review',
      }),
    )
    detachMock.mockResolvedValue(
      createLiveSnapshot({
        sessionId: 'session-alpha',
        title: 'Alpha session review',
      }),
    )

    const attachDialog = await openCommandPalette()
    fireEvent.click(within(attachDialog).getByText('Attach to Session'))

    await waitFor(() => {
      expect(attachMock).toHaveBeenCalledWith('session-alpha')
    })
    expect(await screen.findByText(/Attached to “Alpha session review”/i)).toBeTruthy()

    const detachDialog = await openCommandPalette()
    const detachPalette = within(detachDialog)
    expect(detachPalette.getByText('Detach from Session')).toBeTruthy()

    fireEvent.click(detachPalette.getByText('Detach from Session'))

    await waitFor(() => {
      expect(detachMock).toHaveBeenCalledWith('session-alpha')
    })
    expect(await screen.findByText(/Detached from “Alpha session review”/i)).toBeTruthy()
    expect(await screen.findByRole('button', { name: /^Attach$/i })).toBeTruthy()
  })
})
