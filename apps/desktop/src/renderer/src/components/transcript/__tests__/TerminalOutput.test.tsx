// @vitest-environment jsdom

import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { TerminalOutput } from '../TerminalOutput'

describe('TerminalOutput', () => {
  beforeEach(() => {
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: {
        writeText: vi.fn().mockResolvedValue(undefined),
      },
    })
  })

  it('shows the full Execute command and output with separate copy actions', async () => {
    const command =
      'pnpm --filter @oxox/desktop exec vitest run src/renderer/src/components/transcript/__tests__/TranscriptRenderer.test.tsx --testNamePattern "search target|exact DOM|tool call ids"'
    const output = '\u001b[32m✓\u001b[39m 12 tests passed\nAll good'

    render(<TerminalOutput command={command} output={output} exitCode={0} />)

    expect(screen.getByText('Command')).toBeTruthy()
    expect(screen.getByText(command).className).toContain('whitespace-pre-wrap')
    expect(screen.getByText('Output')).toBeTruthy()
    expect(
      screen.getByText((_, node) => node?.textContent === '✓ 12 tests passed\nAll good'),
    ).toBeTruthy()
    expect(screen.getByText('exit 0')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: /copy command/i }))
    fireEvent.click(screen.getByRole('button', { name: /copy output/i }))

    await waitFor(() => {
      expect(navigator.clipboard.writeText).toHaveBeenCalledWith(command)
      expect(navigator.clipboard.writeText).toHaveBeenCalledWith('✓ 12 tests passed\nAll good')
    })
  })
})
