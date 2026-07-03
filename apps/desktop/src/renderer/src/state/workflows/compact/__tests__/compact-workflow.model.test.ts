import { describe, expect, it, vi } from 'vitest'
import { AsyncActionsStore } from '../../../composer/async-actions.model'
import { CompactWorkflowStore } from '../compact-workflow.model'

describe('CompactWorkflowStore', () => {
  it('submits instructions and model with visible progress', async () => {
    const compact = vi.fn().mockResolvedValue({
      snapshot: {
        sessionId: 'session-compact',
        title: 'Compacted Alpha',
        status: 'idle',
        transport: 'stream-jsonrpc',
        processId: 1,
        viewerCount: 1,
        projectWorkspacePath: '/tmp/project',
        parentSessionId: 'session-alpha',
        availableModels: [],
        settings: { modelId: 'gpt-5.4-mini' },
        messages: [],
        events: [],
      },
      removedCount: 12,
    })
    const asyncActionsStore = new AsyncActionsStore()
    const onCompacted = vi.fn()
    const store = new CompactWorkflowStore(
      () => 'session-alpha',
      () => ({ title: 'Alpha session' }),
      () => 'current-model',
      { compact },
      asyncActionsStore,
      onCompacted,
    )

    store.openCompactDialog()
    store.setCustomInstructionsDraft(' Keep decisions only ')
    store.setCompactionModelDraft('gpt-5.4-mini')
    const result = await store.submitCompact()

    expect(compact).toHaveBeenCalledWith('session-alpha', {
      customInstructions: 'Keep decisions only',
      compactionModel: 'gpt-5.4-mini',
    })
    expect(onCompacted).toHaveBeenCalledWith(result)
    expect(asyncActionsStore.actions[0]).toMatchObject({
      title: 'Compression complete',
      status: 'success',
    })
  })
})
