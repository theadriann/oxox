// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type {
  FoundationBootstrap,
  LiveSessionRewindInfo,
  LiveSessionSnapshot,
  OxoxBridge,
  SessionRecord,
} from '../../../../shared/ipc/contracts'
import { createLocalStoragePort, createMemoryPersistencePort } from '../../platform/persistence'
import { type ComposerSessionGateway, ComposerStore } from '../ComposerStore'
import { FoundationStore, type FoundationStoreBridge } from '../FoundationStore'
import { LiveSessionStore } from '../LiveSessionStore'
import { SessionStore } from '../SessionStore'
import { createStoreEventBus } from '../storeEventBus'
import { TransportStore } from '../TransportStore'

function createSessionRecord(overrides: Partial<SessionRecord> = {}): SessionRecord {
  return {
    id: 'session-alpha',
    projectId: 'project-alpha',
    projectWorkspacePath: '/tmp/project-alpha',
    projectDisplayName: null,
    modelId: 'gpt-5.4',
    title: 'Alpha session',
    status: 'idle',
    transport: 'artifacts',
    createdAt: '2026-03-24T23:30:00.000Z',
    lastActivityAt: '2026-03-24T23:40:00.000Z',
    updatedAt: '2026-03-24T23:40:00.000Z',
    ...overrides,
  }
}

function createLiveSnapshot(overrides: Partial<LiveSessionSnapshot> = {}): LiveSessionSnapshot {
  return {
    sessionId: 'session-alpha',
    title: 'Alpha live session',
    status: 'active',
    transport: 'stream-jsonrpc',
    processId: 4242,
    viewerCount: 1,
    projectWorkspacePath: '/tmp/project-alpha',
    parentSessionId: null,
    availableModels: [
      { id: 'gpt-5.4', name: 'GPT 5.4' },
      { id: 'gpt-5.4-mini', name: 'GPT 5.4 Mini' },
    ],
    settings: {
      modelId: 'gpt-5.4-mini',
      interactionMode: 'spec',
    },
    messages: [],
    events: [],
    ...overrides,
  }
}

function createRewindInfo(overrides: Partial<LiveSessionRewindInfo> = {}): LiveSessionRewindInfo {
  return {
    availableFiles: [
      {
        filePath: '/tmp/project-alpha/src/index.ts',
        contentHash: 'hash-1',
        size: 128,
      },
    ],
    createdFiles: [{ filePath: '/tmp/project-alpha/src/new-file.ts' }],
    evictedFiles: [
      { filePath: '/tmp/project-alpha/src/old-file.ts', reason: 'Too old to restore' },
    ],
    ...overrides,
  }
}

function createBootstrap(overrides: Partial<FoundationBootstrap> = {}): FoundationBootstrap {
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
    factoryModels: [{ id: 'gpt-5.4', name: 'GPT 5.4' }],
    factoryDefaultSettings: {
      model: 'gpt-5.4',
      interactionMode: 'auto',
    },
    ...overrides,
  }
}

function createStores(
  options: {
    bootstrap?: FoundationBootstrap
    sessions?: SessionRecord[]
    selectedSessionId?: string
    snapshot?: LiveSessionSnapshot | null
    snapshotLoader?: (sessionId: string) => Promise<LiveSessionSnapshot | null>
    sessionApi?: Partial<OxoxBridge['session']>
    foundationBridge?: FoundationStoreBridge
    persistence?: ReturnType<typeof createMemoryPersistencePort>
  } = {},
) {
  const persistence = options.persistence ?? createLocalStoragePort()
  const bus = createStoreEventBus()
  const sessionStore = new SessionStore(persistence)
  sessionStore.hydrateSessions(options.sessions ?? [createSessionRecord()])

  if (options.selectedSessionId) {
    sessionStore.selectSession(options.selectedSessionId)
  }

  const transportStore = new TransportStore()
  sessionStore.connectToEventBus(bus)
  transportStore.connectToEventBus(bus)
  const foundationStore = new FoundationStore(bus, options.foundationBridge)
  foundationStore.foundation = options.bootstrap ?? createBootstrap()
  foundationStore.hasLoadedFoundation = true
  foundationStore.foundationLoadError = null

  const liveSessionStore = new LiveSessionStore(
    () => sessionStore.selectedSessionId || null,
    bus,
    options.snapshotLoader,
    (sessionId) => sessionStore.sessions.find((session) => session.id === sessionId),
  )

  if (options.snapshot) {
    liveSessionStore.upsertSnapshot(options.snapshot)
  }

  const composerStore = new ComposerStore(
    sessionStore,
    liveSessionStore,
    foundationStore,
    (options.sessionApi ??
      (window.oxox?.session as ComposerSessionGateway | undefined) ??
      {}) as ComposerSessionGateway,
    persistence,
  )

  return {
    composerStore,
    foundationStore,
    liveSessionStore,
    sessionStore,
    transportStore,
  }
}

function mockBridge(sessionOverrides: Partial<OxoxBridge['session']> = {}) {
  window.oxox = {
    session: {
      create: vi.fn().mockResolvedValue(createLiveSnapshot()),
      getSnapshot: vi.fn().mockResolvedValue(createLiveSnapshot()),
      attach: vi.fn().mockResolvedValue(createLiveSnapshot()),
      detach: vi.fn().mockResolvedValue(createLiveSnapshot({ status: 'idle' })),
      addUserMessage: vi.fn().mockResolvedValue(undefined),
      updateSettings: vi.fn().mockResolvedValue(undefined),
      interrupt: vi.fn().mockResolvedValue(undefined),
      compact: vi.fn().mockResolvedValue({
        snapshot: createLiveSnapshot({ sessionId: 'session-compact' }),
        removedCount: 3,
      }),
      fork: vi.fn().mockResolvedValue(createLiveSnapshot({ sessionId: 'session-fork' })),
      getRewindInfo: vi.fn().mockResolvedValue(createRewindInfo()),
      executeRewind: vi.fn().mockResolvedValue({
        snapshot: createLiveSnapshot({ sessionId: 'session-rewind', title: 'Rewinded session' }),
        restoredCount: 1,
        deletedCount: 1,
        failedRestoreCount: 0,
        failedDeleteCount: 0,
      }),
      resolvePermissionRequest: vi.fn().mockResolvedValue(undefined),
      resolveAskUser: vi.fn().mockResolvedValue(undefined),
      ...sessionOverrides,
    },
  } as OxoxBridge
}

describe('ComposerStore', () => {
  beforeEach(() => {
    window.localStorage.clear()
    mockBridge()
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: {
        writeText: vi.fn().mockResolvedValue(undefined),
      },
    })
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('sets draft and error state, then clears them when the selected session changes', () => {
    const { composerStore, sessionStore } = createStores({
      sessions: [
        createSessionRecord({ id: 'session-alpha', title: 'Alpha session' }),
        createSessionRecord({
          id: 'session-beta',
          projectId: 'project-beta',
          projectWorkspacePath: '/tmp/project-beta',
          title: 'Beta session',
        }),
      ],
    })

    composerStore.setDraft('Ship the composer store')
    composerStore.setError('Composer failed')
    sessionStore.selectSession('session-beta')
    composerStore.resetForSession('session-beta')

    expect(composerStore.draft).toBe('')
    expect(composerStore.error).toBeNull()
  })

  it('derives preferences and computed state from the selected session, snapshot, and foundation defaults', () => {
    const { composerStore, liveSessionStore } = createStores({
      bootstrap: createBootstrap({
        factoryModels: [
          { id: 'claude-3.7', name: 'Claude 3.7 Sonnet' },
          { id: 'gpt-5.4', name: 'GPT 5.4' },
        ],
        factoryDefaultSettings: {
          model: 'claude-3.7',
          interactionMode: 'spec',
        },
      }),
    })

    expect(composerStore.selectedPreferences).toEqual({
      modelId: 'claude-3.7',
      interactionMode: 'spec',
      reasoningEffort: '',
      autonomyLevel: 'medium',
    })
    expect(composerStore.selectedAvailableModels.map((model) => model.id)).toEqual([
      'claude-3.7',
      'gpt-5.4',
    ])
    expect(composerStore.selectedStatus).toBe('idle')
    expect(composerStore.canAttachSelected).toBe(true)
    expect(composerStore.selectedNeedsReconnect).toBe(false)

    liveSessionStore.upsertSnapshot(
      createLiveSnapshot({
        status: 'error',
        settings: {
          modelId: 'gpt-5.4-mini',
          interactionMode: 'auto',
        },
      }),
    )
    composerStore.sendingSessionId = 'session-alpha'
    composerStore.attachingSessionId = 'session-alpha'
    composerStore.interruptingSessionId = 'session-alpha'

    expect(composerStore.selectedPreferences).toEqual({
      modelId: 'gpt-5.4-mini',
      interactionMode: 'auto',
      reasoningEffort: '',
      autonomyLevel: 'medium',
    })
    expect(composerStore.selectedAvailableModels.map((model) => model.id)).toEqual([
      'gpt-5.4',
      'gpt-5.4-mini',
    ])
    expect(composerStore.selectedStatus).toBe('error')
    expect(composerStore.canAttachSelected).toBe(true)
    expect(composerStore.selectedNeedsReconnect).toBe(true)
    expect(composerStore.isSendingSelected).toBe(true)
    expect(composerStore.isAttachingSelected).toBe(true)
    expect(composerStore.isInterruptingSelected).toBe(true)
  })

  it('keeps context usage aligned with the live snapshot model until the snapshot updates', () => {
    const { composerStore } = createStores({
      bootstrap: createBootstrap({
        factoryModels: [
          { id: 'gpt-5.4', name: 'GPT 5.4', maxContextLimit: 400000 },
          { id: 'gpt-5.4-mini', name: 'GPT 5.4 Mini', maxContextLimit: 100000 },
        ],
        factoryDefaultSettings: {
          model: 'gpt-5.4-mini',
          interactionMode: 'auto',
          compactionTokenLimit: 500000,
        },
      }),
      snapshot: createLiveSnapshot({
        availableModels: [
          { id: 'gpt-5.4', name: 'GPT 5.4', maxContextLimit: 400000 },
          { id: 'gpt-5.4-mini', name: 'GPT 5.4 Mini', maxContextLimit: 100000 },
        ],
        settings: {
          modelId: 'gpt-5.4-mini',
          interactionMode: 'spec',
        },
        events: [
          {
            type: 'session.tokenUsageChanged',
            tokenUsage: {
              inputTokens: 50000,
              outputTokens: 1000,
              cacheCreationTokens: 0,
              cacheReadTokens: 0,
              thinkingTokens: 0,
            },
            lastCallTokenUsage: {
              inputTokens: 50000,
              cacheReadTokens: 0,
            },
          },
        ],
      }),
    })

    expect(composerStore.selectedPreferences.modelId).toBe('gpt-5.4-mini')
    expect(composerStore.selectedComposerContextUsage).toMatchObject({
      contextLimit: 100000,
      usedContext: 50000,
      usedPercentage: 50,
    })

    composerStore.updatePreferences('session-alpha', { modelId: 'gpt-5.4' })

    expect(composerStore.selectedPreferences.modelId).toBe('gpt-5.4')
    expect(composerStore.selectedComposerContextUsage).toMatchObject({
      contextLimit: 100000,
      usedContext: 50000,
      usedPercentage: 50,
    })
  })

  it('hydrates persisted preferences and persists updates back to localStorage', () => {
    window.localStorage.setItem(
      'oxox.session.composer',
      JSON.stringify({
        'session-alpha': {
          modelId: 'claude-3.7',
          interactionMode: 'spec',
        },
      }),
    )

    const { composerStore } = createStores()

    expect(composerStore.preferencesBySessionId).toEqual({
      'session-alpha': {
        modelId: 'claude-3.7',
        interactionMode: 'spec',
        reasoningEffort: '',
        autonomyLevel: 'medium',
      },
    })

    composerStore.updatePreferences('session-alpha', { interactionMode: 'auto' })

    expect(JSON.parse(window.localStorage.getItem('oxox.session.composer') ?? '{}')).toEqual({
      'session-alpha': {
        modelId: 'claude-3.7',
        interactionMode: 'auto',
        reasoningEffort: '',
        autonomyLevel: 'medium',
      },
    })
  })

  it('hydrates and persists composer preferences through an injected persistence port', () => {
    const persistence = createMemoryPersistencePort({
      'oxox.session.composer': {
        'session-alpha': {
          modelId: 'claude-3.7',
          interactionMode: 'spec',
        },
      },
    })

    const { composerStore } = createStores({ persistence })

    expect(composerStore.preferencesBySessionId).toEqual({
      'session-alpha': {
        modelId: 'claude-3.7',
        interactionMode: 'spec',
        reasoningEffort: '',
        autonomyLevel: 'medium',
      },
    })

    composerStore.updatePreferences('session-alpha', { interactionMode: 'auto' })

    expect(persistence.get('oxox.session.composer', {})).toEqual({
      'session-alpha': {
        modelId: 'claude-3.7',
        interactionMode: 'auto',
        reasoningEffort: '',
        autonomyLevel: 'medium',
      },
    })
  })

  it('submits a message by auto-attaching, updating settings, sending the draft, and refreshing the snapshot', async () => {
    const attachedSnapshot = createLiveSnapshot({
      title: 'Attached session',
      settings: {
        modelId: 'gpt-5.4-mini',
        interactionMode: 'spec',
      },
    })
    const refreshedSnapshot = createLiveSnapshot({
      title: 'Refreshed session',
      messages: [
        {
          id: 'message-user-1',
          role: 'user',
          content: 'Ship it',
        },
      ],
    })
    const attach = vi.fn().mockResolvedValue(attachedSnapshot)
    const updateSettings = vi.fn().mockResolvedValue(undefined)
    const addUserMessage = vi.fn().mockResolvedValue(undefined)
    const getSnapshot = vi.fn().mockResolvedValue(refreshedSnapshot)
    Reflect.deleteProperty(window, 'oxox')

    const { composerStore, liveSessionStore } = createStores({
      bootstrap: createBootstrap({
        factoryModels: [
          {
            id: 'gpt-5.4',
            name: 'GPT 5.4',
            supportedReasoningEfforts: ['medium', 'high'],
            defaultReasoningEffort: 'medium',
          },
          { id: 'gpt-5.4-mini', name: 'GPT 5.4 Mini' },
        ],
      }),
      snapshotLoader: getSnapshot,
      sessionApi: {
        attach,
        updateSettings,
        addUserMessage,
      },
    })

    composerStore.setDraft('Ship it')

    await composerStore.submit({
      text: 'Ship it',
      modelId: 'gpt-5.4-mini',
      interactionMode: 'spec',
      autonomyLevel: 'medium',
    })

    expect(attach).toHaveBeenCalledWith('session-alpha')
    expect(updateSettings).toHaveBeenCalledWith('session-alpha', {
      modelId: 'gpt-5.4-mini',
      interactionMode: 'spec',
      autonomyLevel: 'medium',
    })
    expect(addUserMessage).toHaveBeenCalledWith('session-alpha', 'Ship it')
    expect(getSnapshot).toHaveBeenCalledWith('session-alpha')
    expect(composerStore.draft).toBe('')
    expect(composerStore.error).toBeNull()
    expect(composerStore.sendingSessionId).toBeNull()
    expect(composerStore.preferencesBySessionId['session-alpha']).toEqual({
      modelId: 'gpt-5.4-mini',
      interactionMode: 'spec',
      reasoningEffort: '',
      autonomyLevel: 'medium',
    })
    expect(liveSessionStore.selectedSnapshot?.title).toBe('Refreshed session')
  })

  it('attaches and detaches the selected session while surfacing feedback', async () => {
    const attachSnapshot = createLiveSnapshot({ title: 'Attached alpha' })
    const detachSnapshot = createLiveSnapshot({
      title: 'Attached alpha',
      status: 'idle',
    })
    const attach = vi.fn().mockResolvedValue(attachSnapshot)
    const detach = vi.fn().mockResolvedValue(detachSnapshot)
    Reflect.deleteProperty(window, 'oxox')

    const { composerStore, liveSessionStore, sessionStore } = createStores({
      sessionApi: { attach, detach },
    })

    await composerStore.attachSelected()

    expect(attach).toHaveBeenCalledWith('session-alpha')
    expect(liveSessionStore.selectedSnapshot?.title).toBe('Attached alpha')
    expect(composerStore.feedbackStore.feedback).toEqual({
      message: 'Attached to “Attached alpha”.',
      tone: 'success',
    })

    await composerStore.detachSelected()

    expect(detach).toHaveBeenCalledWith('session-alpha')
    expect(liveSessionStore.selectedSnapshot).toBeNull()
    expect(sessionStore.selectedSession?.status).toBe('idle')
    expect(composerStore.feedbackStore.feedback).toEqual({
      message: 'Detached from “Attached alpha”.',
      tone: 'success',
    })
  })

  it('forks via the primary session api and interrupts the selected live session', async () => {
    const getSnapshot = vi.fn().mockResolvedValue(
      createLiveSnapshot({
        sessionId: 'session-fork',
        title: 'Forked session',
        status: 'waiting',
      }),
    )
    const fork = vi.fn().mockResolvedValue(
      createLiveSnapshot({
        sessionId: 'session-fork',
        title: 'Forked session',
        status: 'active',
      }),
    )
    const interrupt = vi.fn().mockResolvedValue(undefined)

    mockBridge({
      fork,
      interrupt,
      getSnapshot,
    })

    const { composerStore, liveSessionStore, sessionStore } = createStores({
      snapshot: createLiveSnapshot({ title: 'Original live session' }),
      snapshotLoader: getSnapshot,
    })

    await composerStore.forkSelected()

    expect(fork).toHaveBeenCalledWith('session-alpha')
    expect(sessionStore.selectedSessionId).toBe('session-fork')
    expect(liveSessionStore.selectedSnapshot?.title).toBe('Forked session')
    expect(composerStore.feedbackStore.feedback).toEqual({
      message: 'Forked “Forked session”.',
      tone: 'success',
    })

    await composerStore.interruptSelected()

    expect(interrupt).toHaveBeenCalledWith('session-fork')
    expect(getSnapshot).toHaveBeenCalledWith('session-fork')
    expect(liveSessionStore.selectedSnapshot?.status).toBe('waiting')
    expect(composerStore.interruptingSessionId).toBeNull()
  })

  it('compacts the selected session and switches to the compacted snapshot', async () => {
    const compact = vi.fn().mockResolvedValue({
      snapshot: createLiveSnapshot({
        sessionId: 'session-compact',
        title: 'Compacted session',
        status: 'active',
      }),
      removedCount: 7,
    })

    mockBridge({
      compact,
    })

    const { composerStore, liveSessionStore, sessionStore } = createStores({
      snapshot: createLiveSnapshot({ title: 'Original session' }),
    })

    await composerStore.compactSelected()

    expect(compact).toHaveBeenCalledWith('session-alpha', undefined)
    expect(sessionStore.selectedSessionId).toBe('session-compact')
    expect(sessionStore.selectedSession).toMatchObject({
      id: 'session-compact',
      title: 'Compacted session',
      derivationType: 'compact',
    })
    expect(liveSessionStore.selectedSnapshot?.title).toBe('Compacted session')
    expect(composerStore.feedbackStore.feedback).toEqual({
      message: 'Compacted “Compacted session” and removed 7 messages.',
      tone: 'success',
    })
  })

  it('uses the primary fork api even when the selected session is not live', async () => {
    const fork = vi.fn().mockResolvedValue(
      createLiveSnapshot({
        sessionId: 'session-fork',
        title: 'Forked session',
        status: 'active',
      }),
    )
    const forkViaDaemon = vi.fn().mockResolvedValue(
      createLiveSnapshot({
        sessionId: 'session-fork-daemon',
        title: 'Daemon forked session',
        status: 'active',
      }),
    )
    const getSnapshot = vi.fn().mockResolvedValue(
      createLiveSnapshot({
        sessionId: 'session-fork',
        title: 'Forked session',
        status: 'active',
      }),
    )

    mockBridge({
      fork,
      forkViaDaemon,
      getSnapshot,
    })

    const { composerStore, sessionStore, liveSessionStore } = createStores({
      selectedSessionId: 'session-alpha',
      snapshot: null,
      snapshotLoader: getSnapshot,
    })

    expect(liveSessionStore.selectedSnapshot).toBeNull()

    await composerStore.forkSelected()

    expect(fork).toHaveBeenCalledWith('session-alpha')
    expect(forkViaDaemon).not.toHaveBeenCalled()
    expect(sessionStore.selectedSessionId).toBe('session-fork')
    expect(composerStore.feedbackStore.feedback).toEqual({
      message: 'Forked \u201cForked session\u201d.',
      tone: 'success',
    })
  })

  it('renames the selected session via daemon-only session api', async () => {
    const renameViaDaemon = vi.fn().mockResolvedValue(undefined)
    const getBootstrap = vi.fn().mockResolvedValue(
      createBootstrap({
        sessions: [createSessionRecord({ title: 'Renamed session' })],
      }),
    )

    mockBridge({
      renameViaDaemon,
    })

    const { composerStore } = createStores({
      selectedSessionId: 'session-alpha',
      foundationBridge: {
        getBootstrap,
      },
    })

    composerStore.renameWorkflow.openRenameDialog()
    composerStore.renameWorkflow.setRenameDraft('Renamed session')

    await composerStore.renameWorkflow.submitRename()

    expect(renameViaDaemon).toHaveBeenCalledWith('session-alpha', 'Renamed session')
    expect(getBootstrap).toHaveBeenCalledTimes(1)
    expect(composerStore.renameWorkflow.isRenameDialogOpen).toBe(false)
    expect(composerStore.feedbackStore.feedback).toEqual({
      message: 'Renamed session to “Renamed session”.',
      tone: 'success',
    })
  })

  it('loads rewind info and executes rewind for the selected session', async () => {
    const getRewindInfo = vi.fn().mockResolvedValue(createRewindInfo())
    const executeRewind = vi.fn().mockResolvedValue({
      snapshot: createLiveSnapshot({
        sessionId: 'session-rewind',
        title: 'Rewinded session',
      }),
      restoredCount: 1,
      deletedCount: 1,
      failedRestoreCount: 0,
      failedDeleteCount: 0,
    })
    const getBootstrap = vi.fn().mockResolvedValue(
      createBootstrap({
        sessions: [createSessionRecord({ id: 'session-rewind', title: 'Rewinded session' })],
      }),
    )

    mockBridge({
      getRewindInfo,
      executeRewind,
    })

    const { composerStore, liveSessionStore, sessionStore } = createStores({
      selectedSessionId: 'session-alpha',
      foundationBridge: {
        getBootstrap,
      },
    })

    composerStore.rewindWorkflow.openRewindDialog()
    composerStore.rewindWorkflow.setRewindMessageId('message-1')
    await composerStore.rewindWorkflow.loadRewindInfo()

    expect(getRewindInfo).toHaveBeenCalledWith('session-alpha', 'message-1')
    expect(composerStore.rewindWorkflow.rewindInfo).toEqual(createRewindInfo())
    expect(composerStore.rewindWorkflow.selectedRestoreFilePaths).toEqual([
      '/tmp/project-alpha/src/index.ts',
    ])
    expect(composerStore.rewindWorkflow.selectedDeleteFilePaths).toEqual([
      '/tmp/project-alpha/src/new-file.ts',
    ])

    composerStore.rewindWorkflow.setRewindForkTitle('Rewinded session')
    await composerStore.rewindWorkflow.submitExecuteRewind()

    expect(executeRewind).toHaveBeenCalledWith('session-alpha', {
      messageId: 'message-1',
      filesToRestore: [
        {
          filePath: '/tmp/project-alpha/src/index.ts',
          contentHash: 'hash-1',
          size: 128,
        },
      ],
      filesToDelete: [{ filePath: '/tmp/project-alpha/src/new-file.ts' }],
      forkTitle: 'Rewinded session',
    })
    expect(getBootstrap).toHaveBeenCalledTimes(1)
    expect(sessionStore.selectedSessionId).toBe('session-rewind')
    expect(liveSessionStore.selectedSnapshot?.title).toBe('Rewinded session')
    expect(composerStore.rewindWorkflow.isRewindDialogOpen).toBe(false)
    expect(composerStore.feedbackStore.feedback).toEqual({
      message: 'Rewound to “Rewinded session”.',
      tone: 'success',
    })
  })

  it('resolves permission and ask-user requests while tracking pending request ids', async () => {
    let resolvePermissionCall: (() => void) | null = null
    let resolveAskUserCall: (() => void) | null = null
    const resolvePermissionRequest = vi.fn().mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          resolvePermissionCall = resolve
        }),
    )
    const resolveAskUser = vi.fn().mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          resolveAskUserCall = resolve
        }),
    )
    const getSnapshot = vi.fn().mockResolvedValue(createLiveSnapshot())

    mockBridge({
      resolvePermissionRequest,
      resolveAskUser,
      getSnapshot,
    })

    const { composerStore } = createStores({
      snapshot: createLiveSnapshot(),
      snapshotLoader: getSnapshot,
    })

    const permissionPromise = composerStore.permissionResolution.resolvePermission(
      'permission-1',
      'approve',
    )

    expect(composerStore.permissionResolution.pendingPermissionRequestIds).toEqual(['permission-1'])

    resolvePermissionCall?.()
    await permissionPromise

    expect(resolvePermissionRequest).toHaveBeenCalledWith(
      'session-alpha',
      'permission-1',
      'approve',
    )
    expect(composerStore.permissionResolution.pendingPermissionRequestIds).toEqual([])

    const askUserPromise = composerStore.permissionResolution.resolveAskUser('ask-user-1', [
      {
        index: 0,
        question: 'Continue?',
        answer: 'Yes',
      },
    ])

    expect(composerStore.permissionResolution.pendingAskUserRequestIds).toEqual(['ask-user-1'])

    resolveAskUserCall?.()
    await askUserPromise

    expect(resolveAskUser).toHaveBeenCalledWith('session-alpha', 'ask-user-1', [
      {
        index: 0,
        question: 'Continue?',
        answer: 'Yes',
      },
    ])
    expect(composerStore.permissionResolution.pendingAskUserRequestIds).toEqual([])
    expect(getSnapshot).toHaveBeenCalledTimes(2)
  })

  it('copies the selected session id, shows feedback, and auto-dismisses it', async () => {
    vi.useFakeTimers()

    const { composerStore } = createStores()

    composerStore.copySelectedId()
    await Promise.resolve()

    expect(navigator.clipboard.writeText).toHaveBeenCalledWith('session-alpha')
    expect(composerStore.feedbackStore.feedback).toEqual({
      message: 'Copied session ID “session-alpha”.',
      tone: 'success',
    })

    await vi.advanceTimersByTimeAsync(2_500)

    expect(composerStore.feedbackStore.feedback).toBeNull()

    composerStore.feedbackStore.showFeedback('Failed to copy', 'error')
    composerStore.feedbackStore.dismissFeedback()

    expect(composerStore.feedbackStore.feedback).toBeNull()
  })
})
