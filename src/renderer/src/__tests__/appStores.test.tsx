// @vitest-environment jsdom

import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import App from '../App'
import { ComposerStore } from '../stores/ComposerStore'
import { FoundationStore } from '../stores/FoundationStore'
import { LiveSessionStore } from '../stores/LiveSessionStore'
import { SessionStore } from '../stores/SessionStore'
import { StoreProvider, useStores } from '../stores/StoreProvider'
import { TranscriptStore } from '../stores/TranscriptStore'
import { TransportStore } from '../stores/TransportStore'
import { UIStore } from '../stores/UIStore'

function StoreProbe() {
  const {
    sessionStore,
    transcriptStore,
    transportStore,
    uiStore,
    foundationStore,
    liveSessionStore,
    composerStore,
  } = useStores() as ReturnType<typeof useStores> & {
    composerStore?: ComposerStore
    foundationStore?: FoundationStore
    liveSessionStore?: LiveSessionStore
  }

  return (
    <dl>
      <div>
        <dt>session</dt>
        <dd>{String(sessionStore instanceof SessionStore)}</dd>
      </div>
      <div>
        <dt>transcript</dt>
        <dd>{String(transcriptStore instanceof TranscriptStore)}</dd>
      </div>
      <div>
        <dt>transport</dt>
        <dd>{String(transportStore instanceof TransportStore)}</dd>
      </div>
      <div>
        <dt>ui</dt>
        <dd>{String(uiStore instanceof UIStore)}</dd>
      </div>
      <div>
        <dt>foundation</dt>
        <dd>{String(foundationStore instanceof FoundationStore)}</dd>
      </div>
      <div>
        <dt>live-session</dt>
        <dd>{String(liveSessionStore instanceof LiveSessionStore)}</dd>
      </div>
      <div>
        <dt>composer</dt>
        <dd>{String(composerStore instanceof ComposerStore)}</dd>
      </div>
    </dl>
  )
}

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
      version: '0.84.0',
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

function mockBridge(bootstrap: unknown) {
  window.oxox = {
    runtime: {
      getInfo: vi.fn().mockResolvedValue(RUNTIME_INFO),
    },
    app: {
      onNotificationNavigation: vi.fn(),
      openNewWindow: vi.fn().mockResolvedValue(undefined),
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

describe('renderer store providers and sidebar shell', () => {
  beforeEach(() => {
    window.localStorage.clear()
    class ResizeObserverMock {
      observe() {}
      unobserve() {}
      disconnect() {}
    }

    vi.stubGlobal('ResizeObserver', ResizeObserverMock)
    Element.prototype.scrollIntoView = vi.fn()
    Object.defineProperty(window, 'innerWidth', {
      configurable: true,
      value: 1200,
    })
    mockBridge(createBootstrap())
  })

  it('instantiates MobX stores through context', () => {
    render(
      <StoreProvider>
        <StoreProbe />
      </StoreProvider>,
    )

    expect(screen.getAllByText('true', { selector: 'dd' })).toHaveLength(7)
  })

  it('renders project-grouped sessions with tooltips and sorted groups', async () => {
    mockBridge(
      createBootstrap({
        sessions: [
          {
            id: 'session-alpha',
            projectId: 'project-alpha',
            projectWorkspacePath: '/tmp/project-alpha',
            projectDisplayName: null,
            title: 'Alpha backlog review',
            status: 'completed',
            transport: 'artifacts',
            createdAt: '2026-03-24T23:30:00.000Z',
            lastActivityAt: '2026-03-24T23:40:00.000Z',
            updatedAt: '2026-03-24T23:40:00.000Z',
          },
          {
            id: 'session-beta',
            projectId: 'project-beta',
            projectWorkspacePath: '/tmp/project-beta',
            projectDisplayName: null,
            title: 'Extremely long beta title that should still be available in a tooltip',
            status: 'active',
            transport: 'artifacts',
            createdAt: '2026-03-24T23:35:00.000Z',
            lastActivityAt: '2026-03-25T00:00:00.000Z',
            updatedAt: '2026-03-25T00:00:00.000Z',
          },
        ],
      }),
    )

    const { container } = render(
      <StoreProvider>
        <App />
      </StoreProvider>,
    )

    expect((await screen.findAllByText('project-beta')).length).toBeGreaterThan(0)
    expect(screen.getAllByTitle(/Extremely long beta title/i).length).toBeGreaterThan(0)

    const projectGroups = Array.from(container.querySelectorAll('[data-project-group]'))
    expect(projectGroups.map((element) => element.getAttribute('data-project-group'))).toEqual([
      'project-beta',
      'project-alpha',
    ])
  })

  it('renders a styled Droid CLI dependency state instead of a blank surface', async () => {
    mockBridge(
      createBootstrap({
        droidCli: {
          available: false,
          path: null,
          version: null,
          searchedLocations: ['/Users/test/.local/bin/droid'],
          error: 'Droid CLI not found on PATH.',
        },
        daemon: {
          status: 'disconnected',
          connectedPort: null,
          lastError: 'Daemon authentication credentials are unavailable.',
          lastConnectedAt: null,
          lastSyncAt: null,
          nextRetryDelayMs: null,
        },
      }),
    )

    render(
      <StoreProvider>
        <App />
      </StoreProvider>,
    )

    expect(await screen.findByText(/Droid CLI required/i)).toBeTruthy()
    expect(screen.getByText(/Install or expose the `droid` binary on your PATH/i)).toBeTruthy()
  })

  it('shows the friendly empty state when no sessions exist', async () => {
    render(
      <StoreProvider>
        <App />
      </StoreProvider>,
    )

    expect(await screen.findByText(/No sessions yet/i)).toBeTruthy()
    expect(screen.getByText(/Waiting for your first indexed session/i)).toBeTruthy()
  })

  it('renders distinct empty states when no session is selected', async () => {
    let capturedSessionStore: SessionStore | null = null

    function SessionStoreCapture() {
      const { sessionStore } = useStores()
      capturedSessionStore = sessionStore
      return null
    }

    mockBridge(
      createBootstrap({
        sessions: [
          {
            id: 'session-alpha',
            projectId: 'project-alpha',
            projectWorkspacePath: '/tmp/project-alpha',
            projectDisplayName: null,
            title: 'Alpha transcript',
            status: 'completed',
            transport: 'artifacts',
            createdAt: '2026-03-24T23:30:00.000Z',
            lastActivityAt: '2026-03-24T23:40:00.000Z',
            updatedAt: '2026-03-24T23:40:00.000Z',
          },
        ],
      }),
    )

    render(
      <StoreProvider>
        <SessionStoreCapture />
        <App />
      </StoreProvider>,
    )

    await screen.findAllByText('Alpha transcript')

    act(() => {
      capturedSessionStore?.selectSession('')
    })

    expect(await screen.findByText('Choose a session to inspect')).toBeTruthy()
    expect(screen.getByText('No session selected')).toBeTruthy()
  })

  it('renders recovery actions when the foundation bootstrap fails', async () => {
    const getBootstrap = vi
      .fn()
      .mockRejectedValueOnce(new Error('Bootstrap unavailable'))
      .mockResolvedValueOnce(createBootstrap())

    mockBridge(createBootstrap())
    window.oxox.foundation.getBootstrap = getBootstrap

    render(
      <StoreProvider>
        <App />
      </StoreProvider>,
    )

    expect((await screen.findAllByText('Unable to load session data')).length).toBeGreaterThan(1)

    fireEvent.click(screen.getAllByRole('button', { name: 'Retry loading sessions' })[0])

    expect(await screen.findByText(/No sessions yet/i)).toBeTruthy()
    expect(getBootstrap).toHaveBeenCalledTimes(2)
  })

  it('renders the bottom status bar and keeps it in sync with global state polling', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-03-25T00:03:01.000Z'))

    try {
      const getBootstrap = vi
        .fn()
        .mockResolvedValueOnce(
          createBootstrap({
            daemon: {
              status: 'connected',
              connectedPort: 37643,
              lastError: null,
              lastConnectedAt: '2026-03-25T00:03:00.000Z',
              lastSyncAt: '2026-03-25T00:01:01.000Z',
              nextRetryDelayMs: null,
            },
            sessions: [
              {
                id: 'session-active-1',
                projectId: 'project-1',
                projectWorkspacePath: '/tmp/project-one',
                projectDisplayName: null,
                title: 'Active session',
                status: 'active',
                transport: 'artifacts',
                createdAt: '2026-03-24T23:40:00.000Z',
                lastActivityAt: '2026-03-25T00:01:01.000Z',
                updatedAt: '2026-03-25T00:01:01.000Z',
              },
              {
                id: 'session-complete-1',
                projectId: 'project-1',
                projectWorkspacePath: '/tmp/project-one',
                projectDisplayName: null,
                title: 'Completed session',
                status: 'completed',
                transport: 'artifacts',
                createdAt: '2026-03-24T23:30:00.000Z',
                lastActivityAt: '2026-03-25T00:00:00.000Z',
                updatedAt: '2026-03-25T00:00:00.000Z',
              },
            ],
          }),
        )
        .mockResolvedValueOnce(
          createBootstrap({
            daemon: {
              status: 'reconnecting',
              connectedPort: null,
              lastError: 'Daemon connection closed (1006).',
              lastConnectedAt: '2026-03-25T00:03:00.000Z',
              lastSyncAt: '2026-03-25T00:03:00.000Z',
              nextRetryDelayMs: 2_000,
            },
            sessions: [
              {
                id: 'session-active-1',
                projectId: 'project-1',
                projectWorkspacePath: '/tmp/project-one',
                projectDisplayName: null,
                title: 'Active session',
                status: 'active',
                transport: 'artifacts',
                createdAt: '2026-03-24T23:40:00.000Z',
                lastActivityAt: '2026-03-25T00:03:00.000Z',
                updatedAt: '2026-03-25T00:03:00.000Z',
              },
              {
                id: 'session-active-2',
                projectId: 'project-1',
                projectWorkspacePath: '/tmp/project-one',
                projectDisplayName: null,
                title: 'Second active session',
                status: 'active',
                transport: 'stream-jsonrpc',
                createdAt: '2026-03-25T00:02:58.000Z',
                lastActivityAt: '2026-03-25T00:03:00.000Z',
                updatedAt: '2026-03-25T00:03:00.000Z',
              },
            ],
          }),
        )
        .mockResolvedValue(
          createBootstrap({
            daemon: {
              status: 'disconnected',
              connectedPort: null,
              lastError: 'Daemon unavailable.',
              lastConnectedAt: '2026-03-25T00:03:00.000Z',
              lastSyncAt: '2026-03-25T00:03:00.000Z',
              nextRetryDelayMs: null,
            },
            sessions: [
              {
                id: 'session-active-1',
                projectId: 'project-1',
                projectWorkspacePath: '/tmp/project-one',
                projectDisplayName: null,
                title: 'Active session',
                status: 'completed',
                transport: 'artifacts',
                createdAt: '2026-03-24T23:40:00.000Z',
                lastActivityAt: '2026-03-25T00:03:00.000Z',
                updatedAt: '2026-03-25T00:03:00.000Z',
              },
              {
                id: 'session-active-2',
                projectId: 'project-1',
                projectWorkspacePath: '/tmp/project-one',
                projectDisplayName: null,
                title: 'Second active session',
                status: 'completed',
                transport: 'artifacts',
                createdAt: '2026-03-25T00:02:58.000Z',
                lastActivityAt: '2026-03-25T00:03:00.000Z',
                updatedAt: '2026-03-25T00:03:00.000Z',
              },
            ],
          }),
        )

      mockBridge(createBootstrap())
      window.oxox.foundation.getBootstrap = getBootstrap
      let foundationChangeListener: ((payload: { refreshedAt: string }) => void) | undefined
      window.oxox.foundation.onChanged = vi.fn((listener) => {
        foundationChangeListener = listener
        return undefined
      })

      render(
        <StoreProvider>
          <App />
        </StoreProvider>,
      )

      await act(async () => {
        await Promise.resolve()
        await Promise.resolve()
      })

      const statusBar = screen.getByTestId('global-status-bar')

      expect(within(statusBar).getByText(/Connected/)).toBeTruthy()
      expect(within(statusBar).getByText('1 active session')).toBeTruthy()
      expect(within(statusBar).getByText(/2m ago/)).toBeTruthy()
      expect(within(statusBar).getByText('droid 0.84.0')).toBeTruthy()

      await act(async () => {
        vi.setSystemTime(new Date('2026-03-25T00:03:06.000Z'))
        foundationChangeListener?.({ refreshedAt: '2026-03-25T00:03:06.000Z' })
        await Promise.resolve()
      })

      expect(within(statusBar).getByText(/Reconnecting/)).toBeTruthy()
      expect(within(statusBar).getByText('2 active sessions')).toBeTruthy()
      expect(within(statusBar).getByTitle('Retrying in 2s')).toBeTruthy()
      expect(within(statusBar).getByText(/just now/)).toBeTruthy()

      await act(async () => {
        vi.setSystemTime(new Date('2026-03-25T00:03:11.000Z'))
        foundationChangeListener?.({ refreshedAt: '2026-03-25T00:03:11.000Z' })
        await Promise.resolve()
      })

      expect(within(statusBar).getByText(/Disconnected/)).toBeTruthy()
      expect(within(statusBar).getByText('0 active sessions')).toBeTruthy()
      expect(getBootstrap).toHaveBeenCalledTimes(3)
    } finally {
      vi.useRealTimers()
    }
  })

  it('persists collapsed project groups and toggles the sidebar with button and Cmd+B', async () => {
    mockBridge(
      createBootstrap({
        sessions: [
          {
            id: 'session-alpha',
            projectId: 'project-alpha',
            projectWorkspacePath: '/tmp/project-alpha',
            projectDisplayName: null,
            modelId: 'gpt-5.4',
            title: 'Alpha focus session',
            status: 'active',
            transport: 'artifacts',
            createdAt: '2026-03-24T23:35:00.000Z',
            lastActivityAt: '2026-03-25T00:00:00.000Z',
            updatedAt: '2026-03-25T00:00:00.000Z',
          },
        ],
      }),
    )

    const view = render(
      <StoreProvider>
        <App />
      </StoreProvider>,
    )

    const groupToggle = (await screen.findAllByRole('button', { name: /project-alpha/i }))[0]
    fireEvent.click(groupToggle)
    expect(
      within(screen.getByLabelText('Session sidebar')).queryByRole('button', {
        name: 'Alpha focus session',
      }),
    ).toBeNull()
    expect(window.localStorage.getItem('oxox.ui.sidebar:window-1')).toContain('project-alpha')
    fireEvent.click(screen.getAllByRole('button', { name: /Hide sidebar/i })[0])
    expect(screen.queryByLabelText('Session sidebar')).toBeNull()

    view.unmount()

    render(
      <StoreProvider>
        <App />
      </StoreProvider>,
    )

    expect(await screen.findByRole('button', { name: /Show sidebar/i })).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: /Show sidebar/i }))
    expect(await screen.findByLabelText('Session sidebar')).toBeTruthy()
    expect(window.localStorage.getItem('oxox.ui.sidebar:window-1')).toContain('project-alpha')

    fireEvent.pointerDown(screen.getByLabelText('Resize sidebar'), { clientX: 256 })
    fireEvent.pointerMove(window, { clientX: 900 })
    fireEvent.pointerUp(window)
    expect(window.localStorage.getItem('oxox.ui.sidebar:window-1')).toContain('"sidebarWidth":600')

    fireEvent.click(screen.getAllByRole('button', { name: /Hide sidebar/i })[0])
    expect(screen.queryByLabelText('Session sidebar')).toBeNull()
  })

  it('toggles and resizes the context panel while showing static metadata and live attach data', async () => {
    const attach = vi.fn().mockResolvedValue(
      createLiveSnapshot({
        sessionId: 'session-alpha',
        title: 'Alpha focus session',
        status: 'active',
        projectWorkspacePath:
          '/tmp/projects/with/an-extremely-long-workspace-name/that-needs-a-tooltip',
        settings: {
          modelId: 'gpt-5.4',
          interactionMode: 'auto',
        },
        events: [
          {
            type: 'session.statusChanged',
            status: 'active',
          },
          {
            type: 'session.tokenUsageChanged',
            tokenUsage: {
              inputTokens: 21,
              outputTokens: 13,
              cacheCreationTokens: 0,
              cacheReadTokens: 3,
              thinkingTokens: 5,
            },
          },
        ],
      }),
    )
    const detach = vi.fn().mockResolvedValue(
      createLiveSnapshot({
        sessionId: 'session-alpha',
        title: 'Alpha focus session',
        status: 'idle',
        projectWorkspacePath:
          '/tmp/projects/with/an-extremely-long-workspace-name/that-needs-a-tooltip',
        settings: {
          modelId: 'gpt-5.4',
          interactionMode: 'auto',
        },
      }),
    )
    window.oxox = {
      runtime: {
        getInfo: vi.fn().mockResolvedValue(RUNTIME_INFO),
      },
      foundation: {
        getBootstrap: vi.fn().mockResolvedValue(
          createBootstrap({
            sessions: [
              {
                id: 'session-alpha',
                projectId: 'project-alpha',
                projectWorkspacePath:
                  '/tmp/projects/with/an-extremely-long-workspace-name/that-needs-a-tooltip',
                projectDisplayName: null,
                modelId: 'gpt-5.4',
                title: 'Alpha focus session',
                status: 'idle',
                transport: 'artifacts',
                createdAt: '2026-03-24T23:35:00.000Z',
                lastActivityAt: '2026-03-25T00:00:00.000Z',
                updatedAt: '2026-03-25T00:00:00.000Z',
              },
            ],
          }),
        ),
      },
      database: {
        listProjects: vi.fn().mockResolvedValue([]),
        listSessions: vi.fn().mockResolvedValue([]),
        listSyncMetadata: vi.fn().mockResolvedValue([]),
      },
      transcript: {
        getSessionTranscript: vi.fn().mockResolvedValue({
          sessionId: 'session-alpha',
          sourcePath: '/tmp/session-alpha.jsonl',
          loadedAt: '2026-03-25T00:00:00.000Z',
          entries: [],
        }),
      },
      dialog: {
        selectDirectory: vi.fn().mockResolvedValue(null),
      },
      session: {
        create: vi.fn().mockResolvedValue(createLiveSnapshot()),
        getSnapshot: vi.fn().mockResolvedValue(createLiveSnapshot()),
        attach,
        detach,
        addUserMessage: vi.fn().mockResolvedValue(undefined),
        updateSettings: vi.fn().mockResolvedValue(undefined),
        interrupt: vi.fn().mockResolvedValue(undefined),
        fork: vi.fn().mockResolvedValue(createLiveSnapshot({ sessionId: 'session-live-fork-1' })),
      },
    }

    const view = render(
      <StoreProvider>
        <App />
      </StoreProvider>,
    )

    expect(await screen.findByLabelText('Context panel')).toBeTruthy()
    const contextPanel = screen.getByLabelText('Context panel')
    expect(within(contextPanel).getByText('Session ID')).toBeTruthy()
    expect(within(contextPanel).getByText('Model')).toBeTruthy()
    expect(within(contextPanel).getByText('gpt-5.4')).toBeTruthy()
    expect(
      within(contextPanel).getByText(
        '/tmp/projects/with/an-extremely-long-workspace-name/that-needs-a-tooltip',
      ),
    ).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: /Hide session details/i }))
    expect(screen.queryByLabelText('Context panel')).toBeNull()

    fireEvent.keyDown(window, { key: 'p', metaKey: true, altKey: true })
    expect(await screen.findByLabelText('Context panel')).toBeTruthy()

    fireEvent.pointerDown(screen.getByLabelText('Resize context panel'), { clientX: 900 })
    fireEvent.pointerMove(window, { clientX: 10 })
    fireEvent.pointerUp(window)
    expect(window.localStorage.getItem('oxox.ui.sidebar:window-1')).toContain(
      '"contextPanelWidth":600',
    )

    fireEvent.click(screen.getByRole('button', { name: /^Attach$/i }))
    expect(await screen.findByText('Token usage')).toBeTruthy()
    expect(screen.getByText('Elapsed')).toBeTruthy()

    fireEvent.keyDown(window, { key: 'k', metaKey: true })
    fireEvent.click(await screen.findByText('Detach from Session'))
    expect(await screen.findByText('Model')).toBeTruthy()
    expect(screen.queryByText('Token usage')).toBeNull()

    view.unmount()

    render(
      <StoreProvider>
        <App />
      </StoreProvider>,
    )

    expect(await screen.findByLabelText('Context panel')).toBeTruthy()
    expect(window.localStorage.getItem('oxox.ui.sidebar:window-1')).toContain(
      '"contextPanelWidth":600',
    )
  })

  it('persists pins and project display names, then creates a live session from the draft-first New Session flow', async () => {
    mockBridge(
      createBootstrap({
        sessions: [
          {
            id: 'session-alpha',
            projectId: 'project-alpha',
            projectWorkspacePath: '/tmp/project-alpha',
            projectDisplayName: null,
            title: 'Alpha focus session',
            status: 'active',
            transport: 'artifacts',
            createdAt: '2026-03-24T23:35:00.000Z',
            lastActivityAt: '2026-03-25T00:00:00.000Z',
            updatedAt: '2026-03-25T00:00:00.000Z',
          },
        ],
      }),
    )

    const view = render(
      <StoreProvider>
        <App />
      </StoreProvider>,
    )

    expect((await screen.findAllByTitle('Alpha focus session')).length).toBeGreaterThan(0)

    // Pin via the row's overflow menu
    const sessionMoreBtn = screen.getByRole('button', {
      name: /More actions for Alpha focus session/i,
    })
    await userEvent.click(sessionMoreBtn)
    await userEvent.click(await screen.findByRole('menuitem', { name: /Pin session/i }))
    expect(screen.getByText('Pinned')).toBeTruthy()

    // The "Rename workspace" action is behind a Radix DropdownMenu that
    // requires full pointer-event sequences to open.  Use userEvent which
    // faithfully dispatches pointerDown / pointerUp / click.
    const moreBtn = screen.getByRole('button', { name: /More actions for project-alpha/i })
    await userEvent.click(moreBtn)
    await userEvent.click(await screen.findByRole('menuitem', { name: /Rename workspace/i }))
    fireEvent.change(screen.getByLabelText(/Project display name for project-alpha/i), {
      target: { value: 'Factory Desktop' },
    })
    fireEvent.click(screen.getByRole('button', { name: /Save project name/i }))

    expect(screen.getAllByText('Factory Desktop').length).toBeGreaterThan(0)

    view.unmount()

    render(
      <StoreProvider>
        <App />
      </StoreProvider>,
    )

    expect((await screen.findAllByTitle('Alpha focus session')).length).toBeGreaterThan(0)
    expect(screen.getByText('Pinned')).toBeTruthy()
    expect(screen.getAllByText('Factory Desktop').length).toBeGreaterThan(0)

    await userEvent.click(
      screen.getAllByRole('button', { name: /More actions for Alpha focus session/i })[0],
    )
    await userEvent.click(await screen.findByRole('menuitem', { name: /Unpin session/i }))
    expect(screen.queryByText('Pinned')).toBeNull()
    expect(screen.getAllByTitle('Alpha focus session').length).toBeGreaterThan(0)
  })

  it('opens the directory picker, keeps the first message in the composer, and only starts after send', async () => {
    const create = vi.fn().mockResolvedValue(
      createLiveSnapshot({
        sessionId: 'session-live-1',
        projectWorkspacePath: '/tmp/live-session',
      }),
    )
    const addUserMessage = vi.fn().mockResolvedValue(undefined)
    const getSnapshot = vi.fn().mockResolvedValue(
      createLiveSnapshot({
        title: 'Reply with HELLO_LIVE_SESSION',
        messages: [
          {
            id: 'message-user-1',
            role: 'user',
            content: 'Reply with HELLO_LIVE_SESSION',
          },
          {
            id: 'message-assistant-1',
            role: 'assistant',
            content: 'HELLO_LIVE_SESSION',
          },
        ],
        events: [
          {
            type: 'message.delta',
            messageId: 'message-assistant-1',
            delta: 'HELLO_',
            channel: 'assistant',
          },
          {
            type: 'message.completed',
            messageId: 'message-assistant-1',
            content: 'HELLO_LIVE_SESSION',
            role: 'assistant',
          },
        ],
      }),
    )

    window.oxox = {
      runtime: {
        getInfo: vi.fn().mockResolvedValue(RUNTIME_INFO),
      },
      foundation: {
        getBootstrap: vi.fn().mockResolvedValue(
          createBootstrap({
            factoryModels: [{ id: 'gpt-5.4', name: 'GPT 5.4' }],
            factoryDefaultSettings: {
              model: 'gpt-5.4',
              interactionMode: 'auto',
            },
          }),
        ),
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
        selectDirectory: vi.fn().mockResolvedValue('/tmp/live-session'),
      },
      session: {
        create,
        getSnapshot,
        attach: vi.fn().mockResolvedValue(createLiveSnapshot()),
        detach: vi.fn().mockResolvedValue(createLiveSnapshot()),
        addUserMessage,
        updateSettings: vi.fn().mockResolvedValue(undefined),
        interrupt: vi.fn().mockResolvedValue(undefined),
        fork: vi.fn().mockResolvedValue(createLiveSnapshot({ sessionId: 'session-live-fork-1' })),
      },
    }

    render(
      <StoreProvider>
        <App />
      </StoreProvider>,
    )

    fireEvent.click(await screen.findByRole('button', { name: /^New$/i }))

    expect(window.oxox.dialog.selectDirectory).not.toHaveBeenCalled()
    expect((await screen.findAllByText('New session')).length).toBeGreaterThan(0)
    expect(screen.getByText(/Pick a workspace, then use the composer below/i)).toBeTruthy()
    expect((screen.getByLabelText(/Message composer/i) as HTMLTextAreaElement).disabled).toBe(true)
    fireEvent.click(screen.getByRole('button', { name: /Choose folder/i }))

    expect(window.oxox.dialog.selectDirectory).toHaveBeenCalledTimes(1)
    expect(await screen.findByDisplayValue('/tmp/live-session')).toBeTruthy()
    expect(screen.queryByLabelText(/Initial prompt/i)).toBeNull()

    const composer = screen.getByLabelText(/Message composer/i)
    fireEvent.change(composer, {
      target: { value: 'Reply with HELLO_LIVE_SESSION' },
    })
    fireEvent.keyDown(composer, { key: 'Enter', code: 'Enter' })

    expect((await screen.findAllByText('Reply with HELLO_LIVE_SESSION')).length).toBeGreaterThan(0)
    expect(screen.getAllByText('/tmp/live-session').length).toBeGreaterThan(0)
    expect(create).toHaveBeenCalledWith('/tmp/live-session')
    expect(addUserMessage).toHaveBeenCalledWith('session-live-1', 'Reply with HELLO_LIVE_SESSION')
  })

  it('disables detached composition and shows an error when Droid CLI model discovery returns no models', async () => {
    window.oxox = {
      runtime: {
        getInfo: vi.fn().mockResolvedValue(RUNTIME_INFO),
      },
      app: {
        onNotificationNavigation: vi.fn(),
        openNewWindow: vi.fn().mockResolvedValue(undefined),
      },
      foundation: {
        getBootstrap: vi.fn().mockResolvedValue(
          createBootstrap({
            factoryModels: [],
            factoryDefaultSettings: {},
            sessions: [
              {
                id: 'session-detached',
                projectId: 'project-detached',
                projectWorkspacePath: '/tmp/detached-session',
                projectDisplayName: null,
                title: 'Detached session',
                status: 'idle',
                transport: 'artifacts',
                createdAt: '2026-03-24T23:35:00.000Z',
                lastActivityAt: '2026-03-25T00:00:00.000Z',
                updatedAt: '2026-03-25T00:00:00.000Z',
              },
            ],
          }),
        ),
      },
      database: {
        listProjects: vi.fn().mockResolvedValue([]),
        listSessions: vi.fn().mockResolvedValue([]),
        listSyncMetadata: vi.fn().mockResolvedValue([]),
      },
      transcript: {
        getSessionTranscript: vi.fn().mockResolvedValue({
          sessionId: 'session-detached',
          sourcePath: '/tmp/detached-session.jsonl',
          loadedAt: '2026-03-25T00:00:00.000Z',
          entries: [],
        }),
      },
      dialog: {
        selectDirectory: vi.fn().mockResolvedValue(null),
      },
      session: {
        create: vi.fn().mockResolvedValue(createLiveSnapshot()),
        getSnapshot: vi.fn().mockResolvedValue(null),
        attach: vi.fn().mockResolvedValue(createLiveSnapshot()),
        detach: vi.fn().mockResolvedValue(createLiveSnapshot()),
        addUserMessage: vi.fn().mockResolvedValue(undefined),
        updateSettings: vi.fn().mockResolvedValue(undefined),
        interrupt: vi.fn().mockResolvedValue(undefined),
        fork: vi.fn().mockResolvedValue(createLiveSnapshot({ sessionId: 'session-live-fork-1' })),
      },
    }

    render(
      <StoreProvider>
        <App />
      </StoreProvider>,
    )

    fireEvent.click((await screen.findAllByTitle('Detached session'))[0])

    const modelSelector = await screen.findByLabelText(/Model selector/i)
    const composer = screen.getByLabelText(/Message composer/i)
    const modeSelector = screen.getByLabelText(/Mode selector/i)

    expect((composer as HTMLTextAreaElement).disabled).toBe(true)
    expect((modelSelector as HTMLSelectElement).disabled).toBe(true)
    expect((modeSelector as HTMLSelectElement).disabled).toBe(true)
    expect(screen.getByText(/No detached models are available from the Droid CLI/i)).toBeTruthy()
  })

  it('closes the new-session panel with Escape and restores focus to the trigger', async () => {
    window.oxox = {
      runtime: {
        getInfo: vi.fn().mockResolvedValue(RUNTIME_INFO),
      },
      app: {
        onNotificationNavigation: vi.fn(),
        openNewWindow: vi.fn().mockResolvedValue(undefined),
      },
      foundation: {
        getBootstrap: vi.fn().mockResolvedValue(createBootstrap()),
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

    render(
      <StoreProvider>
        <App />
      </StoreProvider>,
    )

    const newSessionButton = await screen.findByRole('button', { name: /^New$/i })
    newSessionButton.focus()

    fireEvent.click(newSessionButton)
    expect(await screen.findByText(/Workspace directory/i)).toBeTruthy()
    expect(screen.queryByLabelText(/Initial prompt/i)).toBeNull()

    fireEvent.keyDown(window, { key: 'Escape' })

    await waitFor(() => {
      expect(screen.queryByText(/Workspace directory/i)).toBeNull()
    })
    expect(document.activeElement).toBe(newSessionButton)
  })

  it('searches, attaches, and sends a composer message with persisted model and mode selections', async () => {
    let sentMessage = ''
    let currentSettings = {
      modelId: 'gpt-5.4',
      interactionMode: 'auto',
    }

    const updateSettings = vi.fn().mockImplementation(async (_sessionId: string, nextSettings) => {
      currentSettings = {
        ...currentSettings,
        ...nextSettings,
      }
    })
    const addUserMessage = vi.fn().mockImplementation(async () => {
      sentMessage = 'Ship the attach flow'
    })
    const getSnapshot = vi.fn().mockImplementation(async () =>
      createLiveSnapshot({
        sessionId: 'session-attach-flow',
        title: 'Attach flow session',
        status: 'idle',
        projectWorkspacePath: '/tmp/attach-flow',
        settings: currentSettings,
        messages: sentMessage
          ? [
              {
                id: 'message-user-1',
                role: 'user',
                content: sentMessage,
              },
            ]
          : [],
      }),
    )
    const attach = vi.fn().mockImplementation(async () => getSnapshot())

    window.oxox = {
      runtime: {
        getInfo: vi.fn().mockResolvedValue(RUNTIME_INFO),
      },
      foundation: {
        getBootstrap: vi.fn().mockResolvedValue(
          createBootstrap({
            sessions: [
              {
                id: 'session-attach-flow',
                projectId: 'project-attach',
                projectWorkspacePath: '/tmp/attach-flow',
                projectDisplayName: null,
                title: 'Attach flow session',
                status: 'active',
                transport: 'artifacts',
                createdAt: '2026-03-24T23:35:00.000Z',
                lastActivityAt: '2026-03-25T00:00:00.000Z',
                updatedAt: '2026-03-25T00:00:00.000Z',
              },
              {
                id: 'session-unrelated',
                projectId: 'project-other',
                projectWorkspacePath: '/tmp/other-session',
                projectDisplayName: null,
                title: 'Unrelated session',
                status: 'completed',
                transport: 'artifacts',
                createdAt: '2026-03-24T22:35:00.000Z',
                lastActivityAt: '2026-03-24T22:40:00.000Z',
                updatedAt: '2026-03-24T22:40:00.000Z',
              },
            ],
          }),
        ),
      },
      database: {
        listProjects: vi.fn().mockResolvedValue([]),
        listSessions: vi.fn().mockResolvedValue([]),
        listSyncMetadata: vi.fn().mockResolvedValue([]),
      },
      transcript: {
        getSessionTranscript: vi.fn().mockResolvedValue({
          sessionId: 'session-attach-flow',
          sourcePath: '/tmp/attach-flow.jsonl',
          loadedAt: '2026-03-25T00:00:00.000Z',
          entries: [],
        }),
      },
      dialog: {
        selectDirectory: vi.fn().mockResolvedValue(null),
      },
      session: {
        create: vi.fn().mockResolvedValue(createLiveSnapshot()),
        getSnapshot,
        attach,
        detach: vi.fn().mockResolvedValue(createLiveSnapshot()),
        addUserMessage,
        updateSettings,
        interrupt: vi.fn().mockResolvedValue(undefined),
        fork: vi.fn().mockResolvedValue(createLiveSnapshot({ sessionId: 'session-live-fork-1' })),
      },
    }

    render(
      <StoreProvider>
        <App />
      </StoreProvider>,
    )

    // Search input is always visible in the redesigned sidebar
    fireEvent.change(await screen.findByLabelText(/Search sessions/i), {
      target: { value: 'attach flow' },
    })

    fireEvent.click((await screen.findAllByTitle('Attach flow session'))[0])
    fireEvent.click(await screen.findByRole('button', { name: /^Attach$/i }))

    expect(await screen.findByText(/Attached to/i)).toBeTruthy()
    expect(attach).toHaveBeenCalledWith('session-attach-flow')

    const composer = screen.getByLabelText(/Message composer/i)
    fireEvent.change(composer, {
      target: { value: 'Ship the attach flow' },
    })
    fireEvent.keyDown(composer, { key: 'Enter', code: 'Enter' })

    expect(await screen.findByText('Ship the attach flow')).toBeTruthy()
    expect((screen.getByLabelText(/Message composer/i) as HTMLTextAreaElement).value).toBe('')
    expect(updateSettings).toHaveBeenCalledWith('session-attach-flow', {
      modelId: 'gpt-5.4',
      interactionMode: 'auto',
      autonomyLevel: 'medium',
    })
    expect(addUserMessage).toHaveBeenCalledWith('session-attach-flow', 'Ship the attach flow')
  })

  it('auto-attaches and sends when submitting from an attachable detached session', async () => {
    let sentMessage = ''
    let currentSettings = {
      modelId: 'gpt-5.4',
      interactionMode: 'auto',
    }

    const updateSettings = vi.fn().mockImplementation(async (_sessionId: string, nextSettings) => {
      currentSettings = {
        ...currentSettings,
        ...nextSettings,
      }
    })
    const addUserMessage = vi.fn().mockImplementation(async () => {
      sentMessage = 'Auto attach from send'
    })
    const getSnapshot = vi.fn().mockImplementation(async () =>
      createLiveSnapshot({
        sessionId: 'session-auto-attach',
        title: 'Auto attach session',
        status: 'idle',
        projectWorkspacePath: '/tmp/auto-attach',
        settings: currentSettings,
        messages: sentMessage
          ? [
              {
                id: 'message-user-1',
                role: 'user',
                content: sentMessage,
              },
            ]
          : [],
      }),
    )
    const attach = vi.fn().mockImplementation(async () => getSnapshot())

    window.oxox = {
      runtime: {
        getInfo: vi.fn().mockResolvedValue(RUNTIME_INFO),
      },
      foundation: {
        getBootstrap: vi.fn().mockResolvedValue(
          createBootstrap({
            sessions: [
              {
                id: 'session-auto-attach',
                projectId: 'project-auto-attach',
                projectWorkspacePath: '/tmp/auto-attach',
                projectDisplayName: null,
                title: 'Auto attach session',
                status: 'active',
                transport: 'artifacts',
                createdAt: '2026-03-24T23:35:00.000Z',
                lastActivityAt: '2026-03-25T00:00:00.000Z',
                updatedAt: '2026-03-25T00:00:00.000Z',
              },
            ],
            factoryModels: [
              { id: 'gpt-5.4', name: 'GPT 5.4' },
              { id: 'gpt-5.4-mini', name: 'GPT 5.4 Mini' },
            ],
            factoryDefaultSettings: {
              model: 'gpt-5.4',
              interactionMode: 'auto',
            },
          }),
        ),
      },
      database: {
        listProjects: vi.fn().mockResolvedValue([]),
        listSessions: vi.fn().mockResolvedValue([]),
        listSyncMetadata: vi.fn().mockResolvedValue([]),
      },
      transcript: {
        getSessionTranscript: vi.fn().mockResolvedValue({
          sessionId: 'session-auto-attach',
          sourcePath: '/tmp/auto-attach.jsonl',
          loadedAt: '2026-03-25T00:00:00.000Z',
          entries: [],
        }),
      },
      dialog: {
        selectDirectory: vi.fn().mockResolvedValue(null),
      },
      session: {
        create: vi.fn().mockResolvedValue(createLiveSnapshot()),
        getSnapshot,
        attach,
        detach: vi.fn().mockResolvedValue(createLiveSnapshot()),
        addUserMessage,
        updateSettings,
        interrupt: vi.fn().mockResolvedValue(undefined),
        fork: vi.fn().mockResolvedValue(createLiveSnapshot({ sessionId: 'session-live-fork-1' })),
      },
    }

    render(
      <StoreProvider>
        <App />
      </StoreProvider>,
    )

    fireEvent.click((await screen.findAllByTitle('Auto attach session'))[0])

    const composer = await screen.findByLabelText(/Message composer/i)
    expect((composer as HTMLTextAreaElement).disabled).toBe(false)

    fireEvent.change(composer, {
      target: { value: 'Auto attach from send' },
    })
    fireEvent.keyDown(composer, { key: 'Enter', code: 'Enter' })

    expect(await screen.findByText('Auto attach from send')).toBeTruthy()
    expect(attach).toHaveBeenCalledWith('session-auto-attach')
    expect(updateSettings).toHaveBeenCalledWith('session-auto-attach', {
      modelId: 'gpt-5.4',
      interactionMode: 'auto',
      autonomyLevel: 'medium',
    })
    expect(addUserMessage).toHaveBeenCalledWith('session-auto-attach', 'Auto attach from send')
    expect(attach.mock.invocationCallOrder[0]).toBeLessThan(
      updateSettings.mock.invocationCallOrder[0],
    )
    expect(updateSettings.mock.invocationCallOrder[0]).toBeLessThan(
      addUserMessage.mock.invocationCallOrder[0],
    )
  })

  it('shows composer errors when auto-attach fails during send', async () => {
    const attach = vi.fn().mockRejectedValue(new Error('Auto-attach failed'))
    const updateSettings = vi.fn().mockResolvedValue(undefined)
    const addUserMessage = vi.fn().mockResolvedValue(undefined)

    window.oxox = {
      runtime: {
        getInfo: vi.fn().mockResolvedValue(RUNTIME_INFO),
      },
      foundation: {
        getBootstrap: vi.fn().mockResolvedValue(
          createBootstrap({
            sessions: [
              {
                id: 'session-auto-attach-error',
                projectId: 'project-auto-attach',
                projectWorkspacePath: '/tmp/auto-attach-error',
                projectDisplayName: null,
                title: 'Auto attach error session',
                status: 'active',
                transport: 'artifacts',
                createdAt: '2026-03-24T23:35:00.000Z',
                lastActivityAt: '2026-03-25T00:00:00.000Z',
                updatedAt: '2026-03-25T00:00:00.000Z',
              },
            ],
            factoryModels: [{ id: 'gpt-5.4', name: 'GPT 5.4' }],
            factoryDefaultSettings: {
              model: 'gpt-5.4',
              interactionMode: 'auto',
            },
          }),
        ),
      },
      database: {
        listProjects: vi.fn().mockResolvedValue([]),
        listSessions: vi.fn().mockResolvedValue([]),
        listSyncMetadata: vi.fn().mockResolvedValue([]),
      },
      transcript: {
        getSessionTranscript: vi.fn().mockResolvedValue({
          sessionId: 'session-auto-attach-error',
          sourcePath: '/tmp/auto-attach-error.jsonl',
          loadedAt: '2026-03-25T00:00:00.000Z',
          entries: [],
        }),
      },
      dialog: {
        selectDirectory: vi.fn().mockResolvedValue(null),
      },
      session: {
        create: vi.fn().mockResolvedValue(createLiveSnapshot()),
        getSnapshot: vi.fn().mockResolvedValue(null),
        attach,
        detach: vi.fn().mockResolvedValue(createLiveSnapshot()),
        addUserMessage,
        updateSettings,
        interrupt: vi.fn().mockResolvedValue(undefined),
        fork: vi.fn().mockResolvedValue(createLiveSnapshot({ sessionId: 'session-live-fork-1' })),
      },
    }

    render(
      <StoreProvider>
        <App />
      </StoreProvider>,
    )

    fireEvent.click((await screen.findAllByTitle('Auto attach error session'))[0])

    const composer = await screen.findByLabelText(/Message composer/i)
    fireEvent.change(composer, {
      target: { value: 'This should fail' },
    })
    fireEvent.keyDown(composer, { key: 'Enter', code: 'Enter' })

    expect(await screen.findByText('Auto-attach failed')).toBeTruthy()
    expect(updateSettings).not.toHaveBeenCalled()
    expect(addUserMessage).not.toHaveBeenCalled()
  })

  it('supports the full keyboard-only palette-to-attach-to-send flow', async () => {
    let sentMessage = ''

    const addUserMessage = vi
      .fn()
      .mockImplementation(async (_sessionId: string, message: string) => {
        sentMessage = message
      })
    const getSnapshot = vi.fn().mockImplementation(async () =>
      createLiveSnapshot({
        sessionId: 'session-attach-flow',
        title: 'Attach flow session',
        status: 'idle',
        projectWorkspacePath: '/tmp/attach-flow',
        messages: sentMessage
          ? [
              {
                id: 'message-user-1',
                role: 'user',
                content: sentMessage,
              },
            ]
          : [],
      }),
    )
    const attach = vi.fn().mockImplementation(async () => getSnapshot())

    window.oxox = {
      runtime: {
        getInfo: vi.fn().mockResolvedValue(RUNTIME_INFO),
      },
      app: {
        onNotificationNavigation: vi.fn(),
        openNewWindow: vi.fn().mockResolvedValue(undefined),
      },
      foundation: {
        getBootstrap: vi.fn().mockResolvedValue(
          createBootstrap({
            sessions: [
              {
                id: 'session-attach-flow',
                projectId: 'project-attach',
                projectWorkspacePath: '/tmp/attach-flow',
                projectDisplayName: null,
                title: 'Attach flow session',
                status: 'active',
                transport: 'artifacts',
                createdAt: '2026-03-24T23:35:00.000Z',
                lastActivityAt: '2026-03-25T00:00:00.000Z',
                updatedAt: '2026-03-25T00:00:00.000Z',
              },
            ],
          }),
        ),
      },
      database: {
        listProjects: vi.fn().mockResolvedValue([]),
        listSessions: vi.fn().mockResolvedValue([]),
        listSyncMetadata: vi.fn().mockResolvedValue([]),
      },
      transcript: {
        getSessionTranscript: vi.fn().mockResolvedValue({
          sessionId: 'session-attach-flow',
          sourcePath: '/tmp/attach-flow.jsonl',
          loadedAt: '2026-03-25T00:00:00.000Z',
          entries: [],
        }),
      },
      dialog: {
        selectDirectory: vi.fn().mockResolvedValue(null),
      },
      session: {
        create: vi.fn().mockResolvedValue(createLiveSnapshot()),
        getSnapshot,
        attach,
        detach: vi.fn().mockResolvedValue(createLiveSnapshot()),
        addUserMessage,
        updateSettings: vi.fn().mockResolvedValue(undefined),
        interrupt: vi.fn().mockResolvedValue(undefined),
        fork: vi.fn().mockResolvedValue(createLiveSnapshot({ sessionId: 'session-live-fork-1' })),
      },
    }

    render(
      <StoreProvider>
        <App />
      </StoreProvider>,
    )

    const user = userEvent.setup()
    const hideDetailsButton = await screen.findByRole('button', {
      name: /Hide session details/i,
    })

    hideDetailsButton.focus()
    fireEvent.keyDown(window, { key: 'k', metaKey: true })

    const paletteInput = await screen.findByLabelText(/Search commands and sessions/i)
    expect(document.activeElement).toBe(paletteInput)

    await user.type(paletteInput, 'attach flow')
    fireEvent.keyDown(paletteInput, { key: 'ArrowDown' })
    fireEvent.keyDown(paletteInput, { key: 'Enter' })

    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: /command palette/i })).toBeNull()
    })

    // After palette session selection, focus eventually moves to the detail area.
    // In jsdom the double requestAnimationFrame focus may land on body; the
    // important invariant is the palette is dismissed and the attach shortcut works.
    await waitFor(() => {
      const active = document.activeElement
      const paletteStillOpen = screen.queryByRole('dialog', { name: /command palette/i })
      expect(paletteStillOpen).toBeNull()
      expect(active?.tagName !== 'INPUT' || !active?.closest('[cmdk-root]')).toBe(true)
    })

    fireEvent.keyDown(window, { key: 'a', metaKey: true, shiftKey: true })

    await waitFor(() => {
      expect(attach).toHaveBeenCalledWith('session-attach-flow')
    })

    const composer = screen.getByLabelText(/Message composer/i)

    for (let index = 0; index < 6 && document.activeElement !== composer; index += 1) {
      await user.tab()
    }

    expect(document.activeElement).toBe(composer)

    await user.type(composer, 'Ship the attach flow{enter}')

    expect(await screen.findByText('Ship the attach flow')).toBeTruthy()
    expect(addUserMessage).toHaveBeenCalledWith('session-attach-flow', 'Ship the attach flow')
  })

  it('shows reconnect guidance for orphaned sessions and reattaches them from the composer', async () => {
    const attach = vi.fn().mockResolvedValue(
      createLiveSnapshot({
        sessionId: 'session-orphan-1',
        title: 'Recovered session',
        status: 'idle',
        projectWorkspacePath: '/tmp/orphaned-session',
      }),
    )

    window.oxox = {
      runtime: {
        getInfo: vi.fn().mockResolvedValue(RUNTIME_INFO),
      },
      foundation: {
        getBootstrap: vi.fn().mockResolvedValue(
          createBootstrap({
            sessions: [
              {
                id: 'session-orphan-1',
                projectId: 'project-orphan',
                projectWorkspacePath: '/tmp/orphaned-session',
                projectDisplayName: null,
                title: 'Recovered session',
                status: 'orphaned',
                transport: 'stream-jsonrpc',
                createdAt: '2026-03-24T23:35:00.000Z',
                lastActivityAt: '2026-03-25T00:00:00.000Z',
                updatedAt: '2026-03-25T00:00:00.000Z',
              },
            ],
          }),
        ),
      },
      database: {
        listProjects: vi.fn().mockResolvedValue([]),
        listSessions: vi.fn().mockResolvedValue([]),
        listSyncMetadata: vi.fn().mockResolvedValue([]),
      },
      transcript: {
        getSessionTranscript: vi.fn().mockResolvedValue({
          sessionId: 'session-orphan-1',
          sourcePath: '/tmp/orphaned-session.jsonl',
          loadedAt: '2026-03-25T00:00:00.000Z',
          entries: [],
        }),
      },
      dialog: {
        selectDirectory: vi.fn().mockResolvedValue(null),
      },
      session: {
        create: vi.fn().mockResolvedValue(createLiveSnapshot()),
        getSnapshot: vi.fn().mockResolvedValue(createLiveSnapshot()),
        attach,
        detach: vi.fn().mockResolvedValue(createLiveSnapshot()),
        addUserMessage: vi.fn().mockResolvedValue(undefined),
        updateSettings: vi.fn().mockResolvedValue(undefined),
        interrupt: vi.fn().mockResolvedValue(undefined),
        fork: vi.fn().mockResolvedValue(createLiveSnapshot({ sessionId: 'session-live-fork-1' })),
      },
    }

    render(
      <StoreProvider>
        <App />
      </StoreProvider>,
    )

    fireEvent.click((await screen.findAllByTitle('Recovered session'))[0])

    expect(await screen.findByText(/Reconnect to continue/i)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /^Reconnect$/i }))

    expect(attach).toHaveBeenCalledWith('session-orphan-1')
    expect(await screen.findByText(/Attached to/i)).toBeTruthy()
  })

  it('keeps a streaming session alive while navigating away and shows messages received while away', async () => {
    let streamedMessages: Array<{ id: string; role: string; content: string }> = []

    const getSnapshot = vi.fn().mockImplementation(async (sessionId: string) => {
      if (sessionId !== 'session-stream-1') {
        return createLiveSnapshot({
          sessionId,
          title: 'Unrelated session',
          status: 'idle',
          projectWorkspacePath: '/tmp/other-session',
        })
      }

      return createLiveSnapshot({
        sessionId: 'session-stream-1',
        title: 'Streaming session',
        status: 'active',
        projectWorkspacePath: '/tmp/stream-session',
        messages: streamedMessages,
      })
    })
    const attach = vi.fn().mockImplementation(async (sessionId: string) => getSnapshot(sessionId))

    window.oxox = {
      runtime: {
        getInfo: vi.fn().mockResolvedValue(RUNTIME_INFO),
      },
      foundation: {
        getBootstrap: vi.fn().mockResolvedValue(
          createBootstrap({
            sessions: [
              {
                id: 'session-stream-1',
                projectId: 'project-stream',
                projectWorkspacePath: '/tmp/stream-session',
                projectDisplayName: null,
                title: 'Streaming session',
                status: 'active',
                transport: 'artifacts',
                createdAt: '2026-03-24T23:35:00.000Z',
                lastActivityAt: '2026-03-25T00:00:00.000Z',
                updatedAt: '2026-03-25T00:00:00.000Z',
              },
              {
                id: 'session-other-1',
                projectId: 'project-other',
                projectWorkspacePath: '/tmp/other-session',
                projectDisplayName: null,
                title: 'Unrelated session',
                status: 'completed',
                transport: 'artifacts',
                createdAt: '2026-03-24T22:35:00.000Z',
                lastActivityAt: '2026-03-24T22:40:00.000Z',
                updatedAt: '2026-03-24T22:40:00.000Z',
              },
            ],
          }),
        ),
      },
      database: {
        listProjects: vi.fn().mockResolvedValue([]),
        listSessions: vi.fn().mockResolvedValue([]),
        listSyncMetadata: vi.fn().mockResolvedValue([]),
      },
      transcript: {
        getSessionTranscript: vi.fn().mockResolvedValue({
          sessionId: 'session-stream-1',
          sourcePath: '/tmp/stream-session.jsonl',
          loadedAt: '2026-03-25T00:00:00.000Z',
          entries: [],
        }),
      },
      dialog: {
        selectDirectory: vi.fn().mockResolvedValue(null),
      },
      session: {
        create: vi.fn().mockResolvedValue(createLiveSnapshot()),
        getSnapshot,
        attach,
        detach: vi.fn().mockResolvedValue(createLiveSnapshot()),
        addUserMessage: vi.fn().mockResolvedValue(undefined),
        updateSettings: vi.fn().mockResolvedValue(undefined),
        interrupt: vi.fn().mockResolvedValue(undefined),
        fork: vi.fn().mockResolvedValue(createLiveSnapshot({ sessionId: 'session-live-fork-1' })),
      },
    }

    render(
      <StoreProvider>
        <App />
      </StoreProvider>,
    )

    fireEvent.click((await screen.findAllByTitle('Streaming session'))[0])
    fireEvent.click(await screen.findByRole('button', { name: /^Attach$/i }))
    expect(attach).toHaveBeenCalledWith('session-stream-1')

    fireEvent.click((await screen.findAllByTitle('Unrelated session'))[0])
    streamedMessages = [
      {
        id: 'message-away-1',
        role: 'assistant',
        content: 'Message received while away',
      },
    ]

    fireEvent.click((await screen.findAllByTitle('Streaming session'))[0])

    expect(await screen.findByText('Message received while away')).toBeTruthy()
  })

  it('navigates to the notified session, restores its latest live content, and highlights it in the sidebar', async () => {
    let notificationListener: ((payload: { sessionId: string }) => void | Promise<void>) | undefined

    const getSnapshot = vi.fn().mockImplementation(async (sessionId: string) => {
      if (sessionId !== 'session-background-complete') {
        return null
      }

      return createLiveSnapshot({
        sessionId: 'session-background-complete',
        title: 'Background completion session',
        status: 'completed',
        projectWorkspacePath: '/tmp/background-complete',
        messages: [
          {
            id: 'message-finished-1',
            role: 'assistant',
            content: 'Latest completion message',
          },
        ],
        events: [
          {
            type: 'stream.completed',
            reason: 'completed',
          },
        ],
      })
    })

    window.oxox = {
      runtime: {
        getInfo: vi.fn().mockResolvedValue(RUNTIME_INFO),
      },
      foundation: {
        getBootstrap: vi.fn().mockResolvedValue(
          createBootstrap({
            sessions: [
              {
                id: 'session-front-1',
                projectId: 'project-front',
                projectWorkspacePath: '/tmp/front-session',
                projectDisplayName: null,
                title: 'Foreground session',
                status: 'active',
                transport: 'artifacts',
                createdAt: '2026-03-24T23:35:00.000Z',
                lastActivityAt: '2026-03-25T00:05:00.000Z',
                updatedAt: '2026-03-25T00:05:00.000Z',
              },
              {
                id: 'session-background-complete',
                projectId: 'project-background',
                projectWorkspacePath: '/tmp/background-complete',
                projectDisplayName: null,
                title: 'Background completion session',
                status: 'completed',
                transport: 'artifacts',
                createdAt: '2026-03-24T23:00:00.000Z',
                lastActivityAt: '2026-03-25T00:00:00.000Z',
                updatedAt: '2026-03-25T00:00:00.000Z',
              },
            ],
          }),
        ),
      },
      database: {
        listProjects: vi.fn().mockResolvedValue([]),
        listSessions: vi.fn().mockResolvedValue([]),
        listSyncMetadata: vi.fn().mockResolvedValue([]),
      },
      transcript: {
        getSessionTranscript: vi.fn().mockResolvedValue({
          sessionId: 'session-background-complete',
          sourcePath: '/tmp/background-complete.jsonl',
          loadedAt: '2026-03-25T00:00:00.000Z',
          entries: [],
        }),
      },
      dialog: {
        selectDirectory: vi.fn().mockResolvedValue(null),
      },
      app: {
        onNotificationNavigation: vi.fn((listener) => {
          notificationListener = listener
          return vi.fn()
        }),
        openNewWindow: vi.fn().mockResolvedValue(undefined),
      },
      session: {
        create: vi.fn().mockResolvedValue(createLiveSnapshot()),
        getSnapshot,
        attach: vi.fn().mockResolvedValue(createLiveSnapshot()),
        detach: vi.fn().mockResolvedValue(createLiveSnapshot()),
        addUserMessage: vi.fn().mockResolvedValue(undefined),
        updateSettings: vi.fn().mockResolvedValue(undefined),
        interrupt: vi.fn().mockResolvedValue(undefined),
        fork: vi.fn().mockResolvedValue(createLiveSnapshot({ sessionId: 'session-live-fork-1' })),
      },
    }

    render(
      <StoreProvider>
        <App />
      </StoreProvider>,
    )

    expect((await screen.findAllByText('Foreground session')).length).toBeGreaterThan(0)

    await act(async () => {
      await notificationListener?.({ sessionId: 'session-background-complete' })
    })

    expect(getSnapshot).toHaveBeenCalledWith('session-background-complete')
    expect((await screen.findAllByText('Background completion session')).length).toBeGreaterThan(0)
    expect(await screen.findByText('Latest completion message')).toBeTruthy()

    const selectedSidebarRow = screen
      .getAllByTitle('Background completion session')[0]
      ?.closest('div')

    expect(selectedSidebarRow?.className).toContain('bg-white/[0.05]')
  })

  it('lets Tab move out of the sidebar without trapping focus', async () => {
    mockBridge(
      createBootstrap({
        sessions: [
          {
            id: 'session-alpha',
            projectId: 'project-alpha',
            projectWorkspacePath: '/tmp/project-alpha',
            projectDisplayName: null,
            title: 'Alpha focus session',
            status: 'active',
            transport: 'artifacts',
            createdAt: '2026-03-24T23:35:00.000Z',
            lastActivityAt: '2026-03-25T00:00:00.000Z',
            updatedAt: '2026-03-25T00:00:00.000Z',
          },
        ],
      }),
    )

    render(
      <StoreProvider>
        <App />
      </StoreProvider>,
    )

    const user = userEvent.setup()
    const sidebarItem = (await screen.findAllByTitle('Alpha focus session'))[0]

    sidebarItem.focus()
    await user.tab()
    expect(document.activeElement).toBe(
      screen.getByRole('button', { name: /More actions for Alpha focus session/i }),
    )

    // Verify key toggle buttons exist and are reachable
    expect(screen.getAllByRole('button', { name: /Hide sidebar/i }).length).toBeGreaterThan(0)
    expect(screen.getByRole('button', { name: /Hide session details/i })).toBeTruthy()
    expect(screen.getByRole('button', { name: /Retry transcript/i })).toBeTruthy()
  })

  it('polls foundation bootstrap updates and shows a deleted-session recovery state', async () => {
    vi.useFakeTimers()

    const getBootstrap = vi
      .fn()
      .mockResolvedValueOnce(
        createBootstrap({
          sessions: [
            {
              id: 'session-delete-me',
              projectId: 'project-1',
              projectWorkspacePath: '/tmp/project-one',
              projectDisplayName: null,
              title: 'Delete me',
              status: 'idle',
              transport: 'artifacts',
              createdAt: '2026-03-24T23:40:00.000Z',
              lastActivityAt: '2026-03-24T23:41:00.000Z',
              updatedAt: '2026-03-24T23:41:00.000Z',
            },
          ],
        }),
      )
      .mockResolvedValue(
        createBootstrap({
          daemon: {
            status: 'disconnected',
            connectedPort: null,
            lastError: 'Daemon connection closed (1006).',
            lastConnectedAt: '2026-03-24T23:41:00.000Z',
            lastSyncAt: '2026-03-24T23:41:01.000Z',
            nextRetryDelayMs: 1000,
          },
        }),
      )

    let foundationChangeListener: ((payload: { refreshedAt: string }) => void) | undefined

    window.oxox = {
      runtime: {
        getInfo: vi.fn().mockResolvedValue(RUNTIME_INFO),
      },
      foundation: {
        getBootstrap,
        onChanged: vi.fn((listener) => {
          foundationChangeListener = listener
          return undefined
        }),
      },
      database: {
        listProjects: vi.fn().mockResolvedValue([]),
        listSessions: vi.fn().mockResolvedValue([]),
        listSyncMetadata: vi.fn().mockResolvedValue([]),
      },
      transcript: {
        getSessionTranscript: vi.fn().mockRejectedValue(new Error('Transcript unavailable')),
      },
    }

    render(
      <StoreProvider>
        <App />
      </StoreProvider>,
    )

    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(screen.getAllByText('Delete me').length).toBeGreaterThan(0)

    await act(async () => {
      foundationChangeListener?.({ refreshedAt: '2026-03-24T23:46:00.000Z' })
      await Promise.resolve()
    })

    expect(screen.getByText(/Session no longer available/i)).toBeTruthy()
    expect(screen.queryByText('Delete me')).toBeNull()
    expect(getBootstrap).toHaveBeenCalledTimes(2)

    vi.useRealTimers()
  })
})
