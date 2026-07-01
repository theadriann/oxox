import { estimateRenderItemSize } from '../TranscriptRenderer'

describe('estimateRenderItemSize', () => {
  it('accounts for tall assistant markdown code blocks', () => {
    const code = Array.from(
      { length: 36 },
      (_, index) => `const value${index} = "${'x'.repeat(48)}"`,
    ).join('\n')

    expect(
      estimateRenderItemSize(
        createAssistantMessageRenderItem(
          `Here is the generated code:\n\n\`\`\`ts\n${code}\n\`\`\``,
        ),
      ),
    ).toBeGreaterThanOrEqual(850)
  })

  it('keeps hook event estimates compact when long output starts collapsed', () => {
    expect(
      estimateRenderItemSize({
        kind: 'timeline-item',
        id: 'hook.execution:1',
        item: {
          kind: 'event',
          id: 'hook.execution:1',
          title: 'Hook failed',
          body: '/Users/brojbean/.factory/hooks/ancestor_agents_context.py',
          typeLabel: 'hook.execution',
          tone: 'danger',
          details: [
            'Event: SessionStart',
            'Timeout: 5ms',
            'Exit code: 1',
            `Stderr: ${'Traceback '.repeat(80)}`,
          ],
        },
      }),
    ).toBeLessThan(120)
  })
})

function createAssistantMessageRenderItem(
  content: string,
): NonNullable<Parameters<typeof estimateRenderItemSize>[0]> {
  return {
    kind: 'timeline-item',
    id: 'assistant-code-message',
    item: {
      kind: 'message',
      id: 'assistant-code-message',
      messageId: 'assistant-code-message',
      role: 'assistant',
      content,
      status: 'completed',
      occurredAt: null,
    },
  }
}
