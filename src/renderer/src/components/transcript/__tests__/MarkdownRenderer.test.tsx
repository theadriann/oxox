// @vitest-environment jsdom

import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { MarkdownRenderer } from '../MarkdownRenderer'

describe('MarkdownRenderer', () => {
  beforeEach(() => {
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: {
        writeText: vi.fn().mockResolvedValue(undefined),
      },
    })
  })

  it('renders fenced code blocks with copy and wrap controls', async () => {
    render(<MarkdownRenderer markdown={'```ts\nconst value = "hello"\n```'} />)

    expect(screen.getByText('ts')).toBeTruthy()
    expect(screen.getByRole('button', { name: /unwrap code text/i })).toBeTruthy()
    expect(screen.getByRole('button', { name: /copy code to clipboard/i })).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: /copy code to clipboard/i }))

    await waitFor(() => {
      expect(navigator.clipboard.writeText).toHaveBeenCalledWith('const value = "hello"')
    })
  })

  it('toggles code block wrapping', () => {
    render(<MarkdownRenderer markdown={'```txt\none very long line\n```'} />)

    const codeBlock = screen.getByTestId('markdown-code-block')
    expect(codeBlock.getAttribute('data-wrap')).toBe('true')

    fireEvent.click(screen.getByRole('button', { name: /unwrap code text/i }))
    expect(codeBlock.getAttribute('data-wrap')).toBe('false')

    fireEvent.click(screen.getByRole('button', { name: /wrap code text/i }))
    expect(codeBlock.getAttribute('data-wrap')).toBe('true')
  })
})
