import { describe, expect, it, vi } from 'vitest'

import { buildContextPanelProps } from '../contextPanelSelectors'

describe('buildContextPanelProps', () => {
  it('maps context-panel store state to pure view props and exposes retry action', () => {
    const refresh = vi.fn()
    const props = buildContextPanelProps({
      foundationStore: {
        hasError: true,
        isLoading: false,
        refresh,
      } as never,
      liveSessionStore: {
        selectedSnapshot: { sessionId: 'live-1' },
      } as never,
      onBrowseSessions: vi.fn(),
      onResizeStart: vi.fn(),
      panelRef: { current: null },
      sessionRuntimeCatalogStore: {
        refreshError: null,
        tools: [{ id: 'tool-read', llmId: 'Read', currentlyAllowed: true, defaultAllowed: true }],
        skills: [],
        mcpServers: [],
        updatingToolLlmId: null,
      },
      sessionStore: {
        selectedSession: { id: 'session-1' },
      } as never,
      uiStore: {
        contextPanelWidth: 360,
      } as never,
    })

    expect(props.isLoading).toBe(false)
    expect(props.liveSession).toEqual({ sessionId: 'live-1' })
    expect(props.runtimeCatalog?.tools).toEqual([
      { id: 'tool-read', llmId: 'Read', currentlyAllowed: true, defaultAllowed: true },
    ])
    expect(props.selectedSession).toEqual({ id: 'session-1' })
    expect(props.width).toBe(360)
    expect(props.errorState?.actionLabel).toBe('Retry loading sessions')

    props.errorState?.onAction()
    expect(refresh).toHaveBeenCalledTimes(1)
  })
})
