// @vitest-environment jsdom

import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { StoreProvider, useStores } from '../../../state/root/store-provider'
import { SessionComposerConnected } from '../SessionComposerConnected'

function SessionSelectionBootstrap({
  transport = 'artifacts',
  workspacePath = '/tmp/project-alpha',
}: {
  transport?: string
  workspacePath?: string | null
} = {}) {
  const { foundationStore, liveSessionStore, sessionStore } = useStores()

  foundationStore.foundation = {
    ...foundationStore.foundation,
    factoryModels: [
      {
        id: 'gpt-5.4',
        name: 'GPT 5.4',
        supportedReasoningEfforts: ['medium', 'high'],
        defaultReasoningEffort: 'medium',
      },
      { id: 'gpt-5.4-mini', name: 'GPT 5.4 Mini' },
    ],
    factoryDefaultSettings: {
      model: 'gpt-5.4',
      interactionMode: 'auto',
    },
  }

  sessionStore.hydrateSessions([
    {
      id: 'session-live-1',
      projectId: 'project-alpha',
      projectWorkspacePath: workspacePath,
      projectDisplayName: null,
      modelId: 'gpt-5.4',
      parentSessionId: null,
      derivationType: null,
      title: 'Connected composer session',
      status: 'active',
      transport,
      createdAt: '2026-03-25T00:00:00.000Z',
      lastActivityAt: '2026-03-25T00:00:00.000Z',
      updatedAt: '2026-03-25T00:00:00.000Z',
    },
  ])
  sessionStore.selectSession('session-live-1')
  liveSessionStore.upsertSnapshot({
    sessionId: 'session-live-1',
    title: 'Connected composer session',
    status: 'idle',
    transport: 'stream-jsonrpc',
    processId: 42,
    viewerCount: 1,
    projectWorkspacePath: workspacePath,
    parentSessionId: null,
    availableModels: [
      {
        id: 'gpt-5.4',
        name: 'GPT 5.4',
        supportedReasoningEfforts: ['medium', 'high'],
        defaultReasoningEffort: 'medium',
      },
      { id: 'gpt-5.4-mini', name: 'GPT 5.4 Mini' },
    ],
    settings: {
      modelId: 'gpt-5.4',
      interactionMode: 'auto',
      reasoningEffort: 'medium',
    },
    messages: [],
    events: [],
  })

  return <SessionComposerConnected />
}

describe('SessionComposerConnected', () => {
  it('reads composer state from stores and submits with default preferences', async () => {
    window.oxox = {
      session: {
        updateSettings: vi.fn().mockResolvedValue(undefined),
        addUserMessage: vi.fn().mockResolvedValue(undefined),
      },
    } as typeof window.oxox

    render(
      <StoreProvider>
        <SessionSelectionBootstrap />
      </StoreProvider>,
    )

    const composer = await screen.findByLabelText(/message composer/i)

    fireEvent.change(composer, { target: { value: 'Use store-driven composer wiring' } })
    fireEvent.keyDown(composer, { key: 'Enter', code: 'Enter' })

    await waitFor(() => {
      expect(window.oxox.session.updateSettings).toHaveBeenCalledWith('session-live-1', {
        modelId: 'gpt-5.4',
        interactionMode: 'auto',
        reasoningEffort: 'medium',
        autonomyLevel: 'medium',
      })
    })

    expect(window.oxox.session.addUserMessage).toHaveBeenCalledWith(
      'session-live-1',
      'Use store-driven composer wiring',
    )
  })

  it('searches selected workspace files for @ mentions', async () => {
    window.oxox = {
      session: {
        updateSettings: vi.fn().mockResolvedValue(undefined),
        addUserMessage: vi.fn().mockResolvedValue(undefined),
      },
      workspaceFiles: {
        list: vi.fn().mockResolvedValue({ files: ['src/App.tsx'] }),
        search: vi.fn().mockResolvedValue({ files: ['src/App.tsx'], totalFiles: 1 }),
        getContent: vi.fn().mockResolvedValue({
          content: 'export function App() {}\n',
          byteLength: 25,
          encoding: 'utf8',
          isBinary: false,
        }),
      },
    } as typeof window.oxox

    render(
      <StoreProvider>
        <SessionSelectionBootstrap transport="stream-jsonrpc" />
      </StoreProvider>,
    )

    const composer = await screen.findByLabelText(/message composer/i)
    fireEvent.change(composer, {
      target: { value: 'Read @ap', selectionStart: 8, selectionEnd: 8 },
    })

    await waitFor(() => {
      expect(window.oxox.workspaceFiles.search).toHaveBeenCalledWith({
        sessionId: 'session-live-1',
        query: 'ap',
        maxResults: 60,
        showHidden: false,
      })
    })
    expect(await screen.findByRole('option', { name: 'src/App.tsx' })).toBeTruthy()
  })

  it('does not search workspace files when the selected session has no workspace path', async () => {
    window.oxox = {
      session: {
        updateSettings: vi.fn().mockResolvedValue(undefined),
        addUserMessage: vi.fn().mockResolvedValue(undefined),
      },
      workspaceFiles: {
        list: vi.fn().mockResolvedValue({ files: ['src/App.tsx'] }),
        search: vi.fn().mockResolvedValue({ files: ['src/App.tsx'], totalFiles: 1 }),
        getContent: vi.fn(),
      },
    } as typeof window.oxox

    render(
      <StoreProvider>
        <SessionSelectionBootstrap transport="stream-jsonrpc" workspacePath={null} />
      </StoreProvider>,
    )

    const composer = await screen.findByLabelText(/message composer/i)
    fireEvent.change(composer, {
      target: { value: 'Read @ap', selectionStart: 8, selectionEnd: 8 },
    })

    expect(screen.queryByRole('listbox', { name: /workspace files/i })).toBeNull()
    expect(window.oxox.workspaceFiles.search).not.toHaveBeenCalled()
  })
})
