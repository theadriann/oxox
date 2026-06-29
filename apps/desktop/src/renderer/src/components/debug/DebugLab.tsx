import { useEffect, useState } from 'react'

import type { SessionTranscript, TranscriptEntry } from '../../../../shared/ipc/contracts'
import { buildHistoricalTimeline } from '../transcript/buildHistoricalTimeline'
import { TranscriptRenderer } from '../transcript/TranscriptRenderer'
import type { TimelineItem } from '../transcript/timelineTypes'

export interface DebugTranscriptRequest {
  entries?: TranscriptEntry[]
  items?: TimelineItem[]
  sessionId?: string
  title?: string
  turnCount?: number
}

export interface DebugLabRoute {
  view: 'home' | 'transcript'
  transcript?: DebugTranscriptRequest
}

interface DebugTranscriptState {
  error: string | null
  isLoading: boolean
  items: TimelineItem[]
  sourceLabel: string
}

const DEBUG_TRANSCRIPT_SESSION_ID = 'debug-transcript'

export function DebugLab({ route }: { route: DebugLabRoute }) {
  return (
    <div className="flex h-screen min-h-0 flex-col bg-fd-canvas text-fd-primary">
      <header className="border-b border-fd-border-subtle bg-fd-panel/80 px-4 py-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-[10px] font-medium uppercase tracking-[0.18em] text-fd-tertiary">
              OXOX Debug Lab
            </p>
            <h1 className="mt-1 text-sm font-medium text-fd-primary">
              {route.view === 'transcript' ? 'Transcript renderer' : 'Component isolation'}
            </h1>
          </div>
          <code className="rounded-md border border-fd-border-subtle bg-fd-canvas px-2 py-1 text-[10px] text-fd-tertiary">
            window.oxoxDebug.close()
          </code>
        </div>
      </header>
      <main className="min-h-0 flex-1">
        {route.view === 'transcript' ? (
          <DebugTranscriptPane request={route.transcript ?? {}} />
        ) : (
          <DebugLabHome />
        )}
      </main>
    </div>
  )
}

function DebugLabHome() {
  return (
    <div className="mx-auto flex h-full max-w-4xl flex-col justify-center px-6">
      <div className="rounded-xl border border-fd-border-default bg-fd-panel p-5">
        <h2 className="text-base font-medium">Debug surfaces</h2>
        <p className="mt-2 text-sm leading-6 text-fd-secondary">
          Open a baked transcript or load an existing session transcript directly from DevTools.
        </p>
        <pre className="mt-4 overflow-x-auto rounded-lg border border-fd-border-subtle bg-fd-canvas p-3 text-xs leading-6 text-fd-secondary">
          {`window.oxoxDebug.renderBakedTranscript()
window.oxoxDebug.renderTranscript({ sessionId: "..." })
window.oxoxDebug.close()`}
        </pre>
      </div>
    </div>
  )
}

function DebugTranscriptPane({ request }: { request: DebugTranscriptRequest }) {
  const [state, setState] = useState<DebugTranscriptState>(() =>
    createInitialTranscriptState(request),
  )

  useEffect(() => {
    let isMounted = true

    async function loadSessionTranscript(sessionId: string) {
      setState((current) => ({ ...current, error: null, isLoading: true }))

      try {
        const transcript = await window.oxox.transcript.getSessionTranscript(sessionId)
        if (!isMounted) return
        setState(createSessionTranscriptState(transcript))
      } catch (error) {
        if (!isMounted) return
        setState({
          error: error instanceof Error ? error.message : 'Unable to load transcript.',
          isLoading: false,
          items: [],
          sourceLabel: sessionId,
        })
      }
    }

    if (request.sessionId) {
      void loadSessionTranscript(request.sessionId)
      return () => {
        isMounted = false
      }
    }

    setState(createInitialTranscriptState(request))
    return () => {
      isMounted = false
    }
  }, [request])

  const sourceLabel = request.title ?? state.sourceLabel

  return (
    <section className="flex h-full min-h-0 flex-col">
      <div className="border-b border-fd-border-subtle px-4 py-2">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate text-xs font-medium text-fd-primary">{sourceLabel}</p>
            <p className="text-[11px] text-fd-tertiary">
              {state.items.length} timeline item{state.items.length === 1 ? '' : 's'}
            </p>
          </div>
          <code className="rounded bg-fd-surface px-2 py-1 text-[10px] text-fd-tertiary">
            TranscriptRenderer
          </code>
        </div>
      </div>

      <div className="min-h-0 flex-1">
        <TranscriptRenderer
          items={state.items}
          isLive={false}
          isLoading={state.isLoading}
          loadingError={state.error}
          scrollContextKey={`debug:${sourceLabel}`}
          contentLayout="fixed"
          bottomInsetPx={0}
        />
      </div>
    </section>
  )
}

function createInitialTranscriptState(request: DebugTranscriptRequest): DebugTranscriptState {
  if (request.items) {
    return {
      error: null,
      isLoading: false,
      items: request.items,
      sourceLabel: request.title ?? 'Custom timeline items',
    }
  }

  if (request.entries) {
    return {
      error: null,
      isLoading: false,
      items: buildHistoricalTimeline(request.entries),
      sourceLabel: request.title ?? 'Custom transcript entries',
    }
  }

  return {
    error: null,
    isLoading: false,
    items: createBakedDebugTimeline(request.turnCount ?? 18),
    sourceLabel: request.title ?? 'Baked transcript fixture',
  }
}

function createSessionTranscriptState(transcript: SessionTranscript): DebugTranscriptState {
  return {
    error: null,
    isLoading: false,
    items: buildHistoricalTimeline(transcript.entries),
    sourceLabel: transcript.sessionId,
  }
}

function createBakedDebugTimeline(turnCount: number): TimelineItem[] {
  return Array.from({ length: turnCount }).flatMap((_, index) => {
    const occurredAt = `2026-06-29T12:${String(index).padStart(2, '0')}:00.000Z`
    const userMessage: TimelineItem = {
      kind: 'message',
      id: `debug-user-${index}`,
      messageId: `debug-user-${index}`,
      role: 'user',
      content: `Debug prompt ${index + 1}: inspect transcript scrolling and marker behavior for turn ${index + 1}.`,
      status: 'completed',
      occurredAt,
    }
    const assistantMessage: TimelineItem = {
      kind: 'message',
      id: `debug-assistant-${index}`,
      messageId: `debug-assistant-${index}`,
      role: 'assistant',
      content: createAssistantFixtureMarkdown(index),
      status: 'completed',
      occurredAt,
    }

    return [userMessage, assistantMessage]
  })
}

function createAssistantFixtureMarkdown(index: number): string {
  const paragraphCount = (index % 3) + 1
  return Array.from(
    { length: paragraphCount },
    (_, paragraphIndex) =>
      `Assistant response ${index + 1}.${paragraphIndex + 1}: this fixture intentionally varies row height so scroll positioning, virtual measurement, and timeline hover previews can be inspected in isolation.`,
  ).join('\n\n')
}

export function createDebugLabRoute(request: DebugTranscriptRequest = {}): DebugLabRoute {
  return { view: 'transcript', transcript: request }
}

export function getInitialDebugLabRoute(): DebugLabRoute | null {
  if (typeof window === 'undefined') return null

  const params = new URLSearchParams(window.location.search)
  if (params.get('oxoxDebug') !== 'transcript') return null

  return createDebugLabRoute({
    sessionId: params.get('sessionId') ?? undefined,
    title: params.get('title') ?? undefined,
  })
}

export function getDebugHelpCommands(): string[] {
  return [
    'window.oxoxDebug.open()',
    'window.oxoxDebug.renderBakedTranscript({ turnCount: 24 })',
    'window.oxoxDebug.renderTranscript({ sessionId: "session-id" })',
    'window.oxoxDebug.renderTranscript({ entries: [...] })',
    'window.oxoxDebug.close()',
  ]
}

export { DEBUG_TRANSCRIPT_SESSION_ID }
