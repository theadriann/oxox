// @vitest-environment jsdom

import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import type { FoundationBootstrap } from '../../../../../shared/ipc/contracts'
import type { SessionPreview } from '../../../state/sessions/session.model'
import { DetailPanel, type DetailPanelProps } from '../DetailPanel'

function createSession(overrides: Partial<SessionPreview> & Pick<SessionPreview, 'id'>) {
  return {
    id: overrides.id,
    title: overrides.title ?? 'Selected session',
    projectKey: overrides.projectKey ?? 'project-alpha',
    projectLabel: overrides.projectLabel ?? 'project-alpha',
    projectWorkspacePath: overrides.projectWorkspacePath ?? '/tmp/project-alpha',
    modelId: overrides.modelId ?? 'gpt-5.4',
    parentSessionId: overrides.parentSessionId ?? null,
    derivationType: overrides.derivationType ?? null,
    hasUserMessage: overrides.hasUserMessage ?? true,
    status: overrides.status ?? 'completed',
    transport: overrides.transport ?? 'artifacts',
    createdAt: overrides.createdAt ?? '2026-06-10T12:00:00.000Z',
    updatedAt: overrides.updatedAt ?? '2026-06-10T12:10:00.000Z',
    lastActivityAt: overrides.lastActivityAt ?? '2026-06-10T12:10:00.000Z',
    lastActivityTimestamp: Date.parse(overrides.lastActivityAt ?? '2026-06-10T12:10:00.000Z'),
  } satisfies SessionPreview
}

function createFoundation(): FoundationBootstrap {
  return {
    database: {
      path: '/tmp/oxox.sqlite',
      exists: true,
      journalMode: 'wal',
      tableNames: ['sessions'],
    },
    droidCli: {
      available: true,
      path: '/bin/droid',
      version: 'droid 1.0.0',
      searchedLocations: ['/bin/droid'],
      error: null,
    },
    daemon: {
      status: 'connected',
      connectedPort: 1234,
      lastError: null,
      lastConnectedAt: '2026-06-10T12:00:00.000Z',
      lastSyncAt: '2026-06-10T12:00:00.000Z',
      nextRetryDelayMs: null,
    },
    projects: [],
    sessions: [
      {
        id: 'parent-session',
        projectId: 'project-alpha',
        projectWorkspacePath: '/tmp/project-alpha',
        projectDisplayName: null,
        modelId: 'gpt-5.4',
        parentSessionId: null,
        derivationType: null,
        hasUserMessage: true,
        title: 'Parent session',
        status: 'completed',
        transport: 'artifacts',
        createdAt: '2026-06-10T11:00:00.000Z',
        lastActivityAt: '2026-06-10T11:30:00.000Z',
        updatedAt: '2026-06-10T11:30:00.000Z',
      },
    ],
    syncMetadata: [],
    factoryModels: [],
    factoryDefaultSettings: {},
  }
}

function createProps(overrides: Partial<DetailPanelProps> = {}): DetailPanelProps {
  return {
    showNewSessionForm: false,
    isFoundationLoading: false,
    hasFoundationError: false,
    isDroidMissing: false,
    hasIndexedSessions: true,
    hasDeletedSelection: false,
    selectedLiveSession: null,
    selectedLiveTimeline: [],
    selectedSession: undefined,
    selectedTranscript: null,
    selectedTranscriptRefreshError: null,
    isRefreshingTranscript: false,
    foundation: createFoundation(),
    newSessionPath: '',
    newSessionError: null,
    newSessionDirectoryPicker: {
      isOpen: false,
      isLoading: false,
      error: null,
      currentPath: '',
      parentPath: null,
      homePath: '',
      entries: [],
    },
    transcriptScrollSignal: 0,
    transcriptSearchTarget: null,
    transcriptScrollPersistenceEnabled: false,
    transcriptScrollState: null,
    transcriptBottomInsetPx: 0,
    pendingPermissionRequestIds: [],
    pendingAskUserRequestIds: [],
    transcriptPrimaryActionRef: { current: null },
    transportProtocol: 'stream-jsonrpc',
    contentLayout: 'fixed',
    onCancelNewSession: vi.fn(),
    onCloseNewSessionDirectoryPicker: vi.fn(),
    onNavigateNewSessionDirectoryPicker: vi.fn(),
    onNewSessionPathChange: vi.fn(),
    onPickDirectory: vi.fn(),
    onSelectNewSessionDirectory: vi.fn(),
    onRefreshFoundation: vi.fn(),
    onRetrySelectedTranscript: vi.fn(),
    onBrowseSessions: vi.fn(),
    onTranscriptScrollStateChange: vi.fn(),
    onResolvePermissionRequest: vi.fn(),
    onSubmitAskUserResponse: vi.fn(),
    ...overrides,
  }
}

describe('DetailPanel', () => {
  it('explains empty compacted sessions by naming the parent session', () => {
    render(
      <DetailPanel
        {...createProps({
          selectedSession: createSession({
            id: 'compact-session',
            title: 'Compacted continuation',
            parentSessionId: 'parent-session',
            derivationType: 'compact',
            hasUserMessage: false,
          }),
        })}
      />,
    )

    expect(screen.getByText('Fresh session after compaction')).toBeTruthy()
    expect(screen.getByText(/Parent session/)).toBeTruthy()
    expect(screen.getByText(/no copied message history/i)).toBeTruthy()
  })
})
