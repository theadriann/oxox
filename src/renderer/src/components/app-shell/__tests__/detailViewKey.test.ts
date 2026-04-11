import { describe, expect, it } from 'vitest'

import { getDetailViewKey } from '../detailViewKey'

describe('getDetailViewKey', () => {
  it('returns a live detail key without encoding status', () => {
    const baseOptions = {
      hasDeletedSelection: false,
      hasFoundationError: false,
      hasIndexedSessions: true,
      isDroidMissing: false,
      isFoundationLoading: false,
      selectedLiveSessionId: 'session-live-1',
      selectedSessionId: 'session-live-1',
      selectedSessionStatus: 'active',
      showNewSessionForm: false,
    }

    expect(
      getDetailViewKey({
        ...baseOptions,
      }),
    ).toBe('detail:live:session-live-1')
  })
})
