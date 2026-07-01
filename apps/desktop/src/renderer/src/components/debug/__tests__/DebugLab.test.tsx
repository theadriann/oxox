// @vitest-environment jsdom

import { act, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import type { SessionTranscript } from '../../../../../shared/ipc/contracts'
import App from '../../../App'
import { DebugLab, type DebugLabRoute } from '../DebugLab'

vi.mock('framer-motion', () => ({
  LazyMotion: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  MotionConfig: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  domAnimation: {},
  useReducedMotion: () => false,
}))

vi.mock('../../app-shell/AppShell', () => ({
  AppShell: () => <div data-testid="app-shell" />,
}))

describe('DebugLab', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    delete window.oxoxDebug
  })

  it('registers a console API that opens a baked transcript lab', async () => {
    const scrollToMock = vi.fn()
    Object.defineProperty(HTMLElement.prototype, 'scrollTo', {
      configurable: true,
      value: scrollToMock,
    })

    render(<App />)

    expect(screen.getByTestId('app-shell')).toBeTruthy()
    expect(window.oxoxDebug?.help()).toContain(
      'window.oxoxDebug.renderBakedTranscript({ turnCount: 24 })',
    )
    expect(window.oxoxDebug?.getTranscriptSizeProfile()).toBeNull()

    act(() => {
      window.oxoxDebug?.renderBakedTranscript({ turnCount: 3, title: 'Scroll debug' })
    })

    expect(await screen.findByText('OXOX Debug Lab')).toBeTruthy()
    expect(screen.getByText('Scroll debug')).toBeTruthy()
    expect(screen.getByText('6 timeline items')).toBeTruthy()

    act(() => {
      window.oxoxDebug?.scrollTranscriptTo?.(
        { kind: 'message', messageId: 'debug-user-2' },
        { align: 'start' },
      )
    })

    await waitFor(() => {
      expect(scrollToMock).toHaveBeenCalled()
    })

    act(() => {
      window.oxoxDebug?.close()
    })

    expect(screen.getByTestId('app-shell')).toBeTruthy()
  })

  it('loads an existing transcript by session id when requested', async () => {
    const transcript: SessionTranscript = {
      entries: [
        {
          id: 'user-1',
          kind: 'message',
          markdown: 'Inspect this session',
          occurredAt: '2026-06-29T12:00:00.000Z',
          role: 'user',
        },
      ],
      loadedAt: '2026-06-29T12:00:01.000Z',
      sessionId: 'session-debug',
      sourcePath: '/tmp/session-debug.jsonl',
    }
    window.oxox = {
      transcript: {
        getSessionTranscript: vi.fn().mockResolvedValue(transcript),
      },
    } as unknown as typeof window.oxox
    const route: DebugLabRoute = {
      transcript: { sessionId: 'session-debug' },
      view: 'transcript',
    }

    render(<DebugLab route={route} />)

    await waitFor(() => {
      expect(window.oxox.transcript.getSessionTranscript).toHaveBeenCalledWith('session-debug')
    })
    expect(await screen.findByText('Inspect this session')).toBeTruthy()
  })
})
