// @vitest-environment jsdom

import { act, fireEvent, render, screen } from '@testing-library/react'

import { ContextPanel } from '../ContextPanel'

const selectedSession = {
  id: 'session-1',
  title: 'Transcript polish',
  projectKey: 'project-alpha',
  projectLabel: 'project-alpha',
  projectWorkspacePath: '/tmp/project-alpha',
  modelId: 'gpt-5.4',
  parentSessionId: null,
  derivationType: null,
  hasUserMessage: true,
  status: 'active' as const,
  createdAt: '2026-03-25T00:00:00.000Z',
  updatedAt: '2026-03-25T00:05:00.000Z',
  lastActivityAt: '2026-03-25T00:05:00.000Z',
  lastActivityTimestamp: Date.parse('2026-03-25T00:05:00.000Z'),
}

describe('ContextPanel', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('renders loading, empty, and error states with actions', () => {
    const onBrowseSessions = vi.fn()
    const onRetry = vi.fn()

    const { rerender } = render(
      <ContextPanel
        liveSession={null}
        isLoading={true}
        now={Date.parse('2026-03-25T00:06:00.000Z')}
        onBrowseSessions={onBrowseSessions}
        onResizeStart={() => undefined}
        selectedSession={undefined}
        width={320}
      />,
    )

    expect(screen.getByLabelText('Context panel')).toBeTruthy()
    expect(screen.getByText('Session Details')).toBeTruthy()

    rerender(
      <ContextPanel
        liveSession={null}
        now={Date.parse('2026-03-25T00:06:00.000Z')}
        onBrowseSessions={onBrowseSessions}
        onResizeStart={() => undefined}
        selectedSession={undefined}
        width={320}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Browse sessions' }))
    expect(onBrowseSessions).toHaveBeenCalledTimes(1)

    rerender(
      <ContextPanel
        errorState={{
          title: 'Context panel unavailable',
          description: 'Retry to reload the latest metadata.',
          actionLabel: 'Retry context',
          onAction: onRetry,
        }}
        liveSession={null}
        now={Date.parse('2026-03-25T00:06:00.000Z')}
        onBrowseSessions={onBrowseSessions}
        onResizeStart={() => undefined}
        selectedSession={selectedSession}
        width={320}
      />,
    )

    expect(screen.getByText('Context panel unavailable')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Retry context' }))
    expect(onRetry).toHaveBeenCalledTimes(1)
  })

  it('updates the live elapsed timer over time when now is omitted', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-03-25T00:06:00.000Z'))

    render(
      <ContextPanel
        liveSession={{
          id: 'live-session-1',
          title: 'Transcript polish',
          projectWorkspacePath: '/tmp/project-alpha',
          status: 'active',
          settings: { modelId: 'gpt-5.4', interactionMode: 'auto' },
          availableModels: [{ id: 'gpt-5.4', name: 'GPT 5.4' }],
          messages: [],
          events: [],
        }}
        onResizeStart={() => undefined}
        selectedSession={selectedSession}
        width={320}
      />,
    )

    expect(screen.getByText('6m 0s')).toBeTruthy()

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2_000)
    })

    expect(screen.getByText('6m 2s')).toBeTruthy()
  })

  it('renders runtime catalogs for live sessions and lets users toggle tool access', () => {
    const onToggleTool = vi.fn()

    render(
      <ContextPanel
        liveSession={{
          id: 'live-session-1',
          title: 'Transcript polish',
          projectWorkspacePath: '/tmp/project-alpha',
          status: 'active',
          settings: {
            modelId: 'gpt-5.4',
            interactionMode: 'spec',
            reasoningEffort: 'high',
            specModeModelId: 'claude-opus-4.1',
            enabledToolIds: ['Read'],
            disabledToolIds: ['Execute'],
          },
          availableModels: [{ id: 'gpt-5.4', name: 'GPT 5.4' }],
          messages: [],
          events: [],
        }}
        onResizeStart={() => undefined}
        runtimeCatalog={{
          refreshError: null,
          tools: [
            {
              id: 'tool-read',
              llmId: 'Read',
              displayName: 'Read',
              defaultAllowed: true,
              currentlyAllowed: true,
            },
            {
              id: 'tool-execute',
              llmId: 'Execute',
              displayName: 'Execute',
              defaultAllowed: true,
              currentlyAllowed: false,
            },
          ],
          skills: [
            {
              name: 'vault-knowledge',
              location: 'personal',
              filePath: '/Users/test/.factory/skills/vault-knowledge/SKILL.md',
            },
          ],
          mcpServers: [
            {
              name: 'figma',
              status: 'connected',
              source: 'user',
              isManaged: false,
              serverType: 'http',
              hasAuthTokens: true,
            },
          ],
          updatingToolLlmId: null,
          onToggleTool,
        }}
        selectedSession={selectedSession}
        width={320}
      />,
    )

    expect(screen.getByLabelText('Context panel').className).toContain('h-full')
    expect(screen.getByText('Session settings')).toBeTruthy()
    expect(screen.getByText('Tool controls')).toBeTruthy()
    expect(screen.getByText('Skills')).toBeTruthy()
    expect(screen.getByText('MCP servers')).toBeTruthy()
    expect(screen.getByText('vault-knowledge')).toBeTruthy()
    expect(screen.getByText('figma')).toBeTruthy()

    fireEvent.click(screen.getByRole('switch', { name: 'Toggle Read tool' }))
    expect(onToggleTool).toHaveBeenCalledWith('Read', false)
  })
})
