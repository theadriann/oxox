import { describe, expect, it } from 'vitest'

import { buildSessionRuntimeCatalogRefreshKey } from '../ContextPanelConnected'

describe('buildSessionRuntimeCatalogRefreshKey', () => {
  it('changes when session activity changes so context stats refresh after each turn', () => {
    const baseSnapshot = {
      sessionId: 'session-1',
      transcriptRevision: 1,
      events: [{ type: 'session.tokenUsageChanged' }],
      settings: {
        modelId: 'gpt-5.4',
        interactionMode: 'spec',
        enabledToolIds: ['Read'],
        disabledToolIds: [],
      },
    }

    expect(
      buildSessionRuntimeCatalogRefreshKey({
        ...baseSnapshot,
        transcriptRevision: 2,
      }),
    ).not.toBe(buildSessionRuntimeCatalogRefreshKey(baseSnapshot))
    expect(
      buildSessionRuntimeCatalogRefreshKey({
        ...baseSnapshot,
        events: [...baseSnapshot.events, { type: 'stream.completed' }],
      }),
    ).not.toBe(buildSessionRuntimeCatalogRefreshKey(baseSnapshot))
  })
})
