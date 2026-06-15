// @vitest-environment jsdom

import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { createPlatformApiClient } from '../../../platform/apiClient'
import { PLACEHOLDER_FOUNDATION } from '../../../state/foundation/foundation.model'
import { RootStore } from '../../../state/root/root.model'
import { StoreProvider } from '../../../state/root/store-provider'
import { GeneralSettings } from '../GeneralSettings'

function renderGeneralSettings() {
  const rootStore = new RootStore(
    createPlatformApiClient({
      oxox: {
        diagnostics: { logTranscriptPerformance: vi.fn() },
      },
    }),
  )
  rootStore.foundationStore.foundation = {
    ...PLACEHOLDER_FOUNDATION,
    factoryDefaultSettings: {
      model: 'claude-opus-4-6',
      interactionMode: 'spec',
      autonomyLevel: 'high',
      reasoningEffort: 'medium',
      compactionThresholdCheckEnabled: true,
      compactionTokenLimit: 300_000,
      compactionModel: 'current-model',
      runInWorktree: true,
      worktreeDirectory: '/Users/test/worktrees',
      subagentModelSettings: { lightModel: 'claude-haiku-4-6' },
      missionSettings: { workerModel: 'claude-sonnet-4-6' },
      missionOrchestratorModel: 'claude-opus-4-6',
      missionOrchestratorReasoningEffort: 'max',
    },
  }

  return {
    rootStore,
    view: render(
      <StoreProvider rootStore={rootStore}>
        <GeneralSettings />
      </StoreProvider>,
    ),
  }
}

describe('GeneralSettings', () => {
  it('surfaces product-relevant Droid defaults', () => {
    renderGeneralSettings()

    expect(screen.getByText('Droid defaults')).not.toBeNull()
    expect(screen.getByText('claude-opus-4-6')).not.toBeNull()
    expect(screen.getByText('Spec')).not.toBeNull()
    expect(screen.getByText('High')).not.toBeNull()
    expect(screen.getByText('current-model')).not.toBeNull()
    expect(screen.getByText('300,000')).not.toBeNull()
    expect(screen.getByText('Automatic compaction')).not.toBeNull()
    expect(screen.getByText('Enabled')).not.toBeNull()
    expect(screen.queryByText('Run in worktree')).toBeNull()
    expect(screen.queryByText('/Users/test/worktrees')).toBeNull()
    expect(screen.getByText('lightModel: claude-haiku-4-6')).not.toBeNull()
    expect(screen.getByText('workerModel: claude-sonnet-4-6')).not.toBeNull()
  })

  it('lets users choose how sub-sessions appear in the sidebar', () => {
    const { rootStore } = renderGeneralSettings()

    expect(screen.getByText('Sub-sessions in sidebar')).not.toBeNull()
    expect(rootStore.uiStore.state$.childSessionVisibilityMode.get()).toBe('selected-parent')

    fireEvent.click(screen.getByRole('button', { name: 'Never' }))

    expect(rootStore.uiStore.state$.childSessionVisibilityMode.get()).toBe('never')
  })
})
