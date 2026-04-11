// @vitest-environment jsdom

import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { StoreProvider, useStores } from '../../../stores/StoreProvider'
import { SessionComposerConnected } from '../SessionComposerConnected'

function SessionSelectionBootstrap() {
  const { foundationStore, liveSessionStore, sessionStore } = useStores()

  foundationStore.foundation = {
    ...foundationStore.foundation,
    factoryModels: [
      { id: 'gpt-5.4', name: 'GPT 5.4' },
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
      projectWorkspacePath: '/tmp/project-alpha',
      projectDisplayName: null,
      modelId: 'gpt-5.4',
      parentSessionId: null,
      derivationType: null,
      title: 'Connected composer session',
      status: 'active',
      transport: 'artifacts',
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
    projectWorkspacePath: '/tmp/project-alpha',
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
        autonomyLevel: 'medium',
      })
    })

    expect(window.oxox.session.addUserMessage).toHaveBeenCalledWith(
      'session-live-1',
      'Use store-driven composer wiring',
    )
  })
})
