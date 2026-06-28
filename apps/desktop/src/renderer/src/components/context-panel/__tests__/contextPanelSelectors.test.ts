import { describe, expect, it, vi } from 'vitest'

import { createMemoryPersistencePort } from '../../../platform/persistence'
import { UIStore } from '../../../state/ui/ui.model'
import { buildContextPanelProps } from '../contextPanelSelectors'

describe('buildContextPanelProps', () => {
  it('maps context-panel store state to pure view props and exposes retry action', () => {
    const refresh = vi.fn()
    const props = buildContextPanelProps({
      foundationStore: {
        factoryDefaultSettings: {
          compactionThresholdCheckEnabled: true,
          compactionTokenLimit: 120_000,
        },
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
      uiStore: createUIStore({ contextPanelWidth: 360 }),
    })

    expect(props.isLoading).toBe(false)
    expect(props.liveSession).toEqual({ sessionId: 'live-1' })
    expect(props.runtimeCatalog?.tools).toEqual([
      { id: 'tool-read', llmId: 'Read', currentlyAllowed: true, defaultAllowed: true },
    ])
    expect(props.factoryDefaultSettings).toEqual({
      compactionThresholdCheckEnabled: true,
      compactionTokenLimit: 120_000,
    })
    expect(props.selectedSession).toEqual({ id: 'session-1' })
    expect(props.width).toBe(360)
    expect(props.errorState?.actionLabel).toBe('Retry loading sessions')

    props.errorState?.onAction()
    expect(refresh).toHaveBeenCalledTimes(1)
  })
})

function createUIStore({ contextPanelWidth }: { contextPanelWidth: number }): UIStore {
  const uiStore = new UIStore(createMemoryPersistencePort())
  uiStore.state$.contextPanelWidth.set(contextPanelWidth)
  return uiStore
}
