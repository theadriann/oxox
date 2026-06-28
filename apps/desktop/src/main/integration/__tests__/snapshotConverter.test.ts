import { describe, expect, it } from 'vitest'

import { normalizeSessionSettings } from '../sessions/snapshotConverter'

describe('normalizeSessionSettings', () => {
  it('preserves SDK-shaped settings values beyond strings and string arrays', () => {
    expect(
      normalizeSessionSettings({
        compactionThresholdCheckEnabled: false,
        compactionTokenLimit: 300_000,
        interactionMode: 'auto',
        missionSettings: {
          planningModel: 'claude-opus-4-6',
        },
        tags: [
          {
            name: 'source:oxox',
            metadata: {
              client: 'desktop',
            },
          },
        ],
      }),
    ).toMatchObject({
      compactionThresholdCheckEnabled: false,
      compactionTokenLimit: 300_000,
      interactionMode: 'auto',
      missionSettings: {
        planningModel: 'claude-opus-4-6',
      },
      tags: [
        {
          name: 'source:oxox',
          metadata: {
            client: 'desktop',
          },
        },
      ],
    })
  })
})
