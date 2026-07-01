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
