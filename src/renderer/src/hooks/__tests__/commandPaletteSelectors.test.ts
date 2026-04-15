import { describe, expect, it, vi } from 'vitest'
import { buildCommandPaletteActions } from '../commandPaletteSelectors'

const noop = () => undefined

function createBaseOptions() {
  return {
    canAttachSelectedSession: false,
    onAttachSelectedSession: vi.fn(),
    onCompactSelectedSession: vi.fn(),
    onCopySelectedSessionId: vi.fn(),
    onDetachSelectedSession: vi.fn(),
    onForkSelectedSession: vi.fn(),
    onOpenNewWindow: vi.fn(),
    onPickDirectory: vi.fn(),
    onRenameSelectedSession: vi.fn(),
    onRewindSelectedSession: vi.fn(),
    pluginAppCommands: [],
    pluginSessionCommands: [],
    selectedLiveSession: null,
    selectedSession: undefined,
    selectedSessionId: '',
  }
}

describe('buildCommandPaletteActions', () => {
  it('returns only global commands when no session is selected', () => {
    const commands = buildCommandPaletteActions(createBaseOptions())
    const ids = commands.map((c) => c.id)
    expect(ids).toContain('new-session')
    expect(ids).toContain('search-sessions')
    expect(ids).toContain('open-new-window')
    expect(ids).not.toContain('copy-session-id')
    expect(ids).not.toContain('fork-session')
  })

  it('includes session commands when a session is selected', () => {
    const commands = buildCommandPaletteActions({
      ...createBaseOptions(),
      selectedSessionId: 'session-1',
      selectedSession: { status: 'active' },
      canAttachSelectedSession: true,
    })
    const ids = commands.map((c) => c.id)
    expect(ids).toContain('attach-session')
    expect(ids).toContain('copy-session-id')
    expect(ids).toContain('fork-session')
    expect(ids).toContain('compact-session')
    expect(ids).toContain('rewind-session')
    expect(ids).toContain('rename-session')
  })

  it('shows detach instead of attach when a live session is present', () => {
    const commands = buildCommandPaletteActions({
      ...createBaseOptions(),
      selectedSessionId: 'session-1',
      selectedSession: { status: 'active' },
      selectedLiveSession: { sessionId: 'session-1' },
    })
    const ids = commands.map((c) => c.id)
    expect(ids).toContain('detach-session')
    expect(ids).not.toContain('attach-session')
  })

  it('includes plugin app commands in global section', () => {
    const pluginCmd = {
      id: 'plugin-capability:test:action',
      label: 'Test Action',
      description: 'A plugin action',
      icon: (() => null) as never,
      onSelect: noop,
    }
    const commands = buildCommandPaletteActions({
      ...createBaseOptions(),
      pluginAppCommands: [pluginCmd],
    })
    expect(commands.find((c) => c.id === 'plugin-capability:test:action')).toBeTruthy()
  })
})
