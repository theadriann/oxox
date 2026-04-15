import { describe, expect, it } from 'vitest'
import type { CommandPaletteAction } from '../../components/command-palette/CommandPalette'
import type { SessionPreview } from '../../stores/SessionStore'
import { buildCommandPaletteViewModel } from '../commandPaletteSelectors'

function createCommand(overrides: Partial<CommandPaletteAction> = {}): CommandPaletteAction {
  return {
    id: 'new-session',
    label: 'New Session',
    description: 'Create a session.',
    icon: (() => null) as never,
    onSelect: () => undefined,
    ...overrides,
  }
}

function createSession(overrides: Partial<SessionPreview> = {}): SessionPreview {
  return {
    id: 'session-1',
    title: 'Session 1',
    projectId: 'project-1',
    projectWorkspacePath: '/tmp/project-1',
    projectLabel: 'project-1',
    projectDisplayName: null,
    modelId: 'gpt-5.4',
    status: 'active',
    transport: 'artifacts',
    createdAt: '2026-04-16T00:00:00.000Z',
    lastActivityAt: '2026-04-16T00:00:00.000Z',
    updatedAt: '2026-04-16T00:00:00.000Z',
    isPinned: false,
    ...overrides,
  }
}

describe('buildCommandPaletteViewModel', () => {
  it('splits commands into global and session sections and only shows sessions while searching', () => {
    const viewModel = buildCommandPaletteViewModel({
      commands: [
        createCommand(),
        createCommand({
          id: 'attach-session',
          label: 'Attach to Session',
        }),
      ],
      sessions: [createSession()],
      hasQuery: false,
    })

    expect(viewModel.globalCommands.map((command) => command.id)).toEqual(['new-session'])
    expect(viewModel.sessionCommands.map((command) => command.id)).toEqual(['attach-session'])
    expect(viewModel.sessionsToRender).toEqual([])
  })

  it('limits rendered sessions while searching', () => {
    const sessions = Array.from({ length: 60 }, (_, index) =>
      createSession({
        id: `session-${index + 1}`,
        title: `Session ${index + 1}`,
      }),
    )

    const viewModel = buildCommandPaletteViewModel({
      commands: [],
      sessions,
      hasQuery: true,
    })

    expect(viewModel.sessionsToRender).toHaveLength(50)
    expect(viewModel.sessionsToRender[0]?.id).toBe('session-1')
    expect(viewModel.sessionsToRender.at(-1)?.id).toBe('session-50')
  })
})
