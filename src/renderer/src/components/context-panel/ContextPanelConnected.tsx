import type { PointerEvent as ReactPointerEvent, RefObject } from 'react'

import { useObserveEffect, useValue } from '../../stores/legend'
import {
  useFoundationStore,
  useLiveSessionStore,
  useSessionRuntimeCatalogStore,
  useSessionStore,
  useUIStore,
} from '../../stores/StoreProvider'
import { ContextPanel } from './ContextPanel'
import { buildContextPanelProps } from './contextPanelSelectors'

interface ContextPanelConnectedProps {
  onBrowseSessions: () => void
  onResizeStart: (event: ReactPointerEvent<HTMLDivElement>) => void
  panelRef: RefObject<HTMLElement | null>
}

interface RuntimeCatalogRefreshSnapshot {
  sessionId: string
  transcriptRevision?: number
  events: Array<{ type?: string }>
  settings: {
    autonomyLevel?: string
    autonomyMode?: string
    disabledToolIds?: readonly string[]
    enabledToolIds?: readonly string[]
    interactionMode?: string
    modelId?: string
    specModeModelId?: string
    specModeReasoningEffort?: string
  }
}

export function buildSessionRuntimeCatalogRefreshKey(
  snapshot: RuntimeCatalogRefreshSnapshot,
): string {
  return JSON.stringify({
    sessionId: snapshot.sessionId,
    transcriptRevision: snapshot.transcriptRevision ?? 0,
    eventCount: snapshot.events.length,
    lastEventType: snapshot.events.at(-1)?.type ?? null,
    settings: {
      autonomyLevel: snapshot.settings.autonomyLevel,
      autonomyMode: snapshot.settings.autonomyMode,
      disabledToolIds: snapshot.settings.disabledToolIds ?? [],
      enabledToolIds: snapshot.settings.enabledToolIds ?? [],
      interactionMode: snapshot.settings.interactionMode,
      modelId: snapshot.settings.modelId,
      specModeModelId: snapshot.settings.specModeModelId,
      specModeReasoningEffort: snapshot.settings.specModeReasoningEffort,
    },
  })
}

export function ContextPanelConnected({
  onBrowseSessions,
  onResizeStart,
  panelRef,
}: ContextPanelConnectedProps) {
  const foundationStore = useFoundationStore()
  const liveSessionStore = useLiveSessionStore()
  const sessionRuntimeCatalogStore = useSessionRuntimeCatalogStore()
  const sessionStore = useSessionStore()
  const uiStore = useUIStore()

  useObserveEffect(() => {
    const isContextPanelHidden = uiStore.isContextPanelHidden
    const selectedSnapshot = liveSessionStore.selectedSnapshot
    const selectedSessionId = selectedSnapshot?.sessionId ?? null
    const refreshKey = selectedSnapshot
      ? buildSessionRuntimeCatalogRefreshKey(selectedSnapshot)
      : ''

    if (isContextPanelHidden || !selectedSessionId) {
      sessionRuntimeCatalogStore.clear()
      return
    }

    void sessionRuntimeCatalogStore.refresh(selectedSessionId, refreshKey)
  })

  const props = useValue(() =>
    buildContextPanelProps({
      foundationStore,
      liveSessionStore,
      onBrowseSessions,
      onResizeStart,
      panelRef,
      sessionRuntimeCatalogStore: {
        contextStats: sessionRuntimeCatalogStore.contextStats,
        mcpServers: sessionRuntimeCatalogStore.mcpServers,
        onToggleTool: (toolLlmId, allowed) => {
          const selectedSnapshot = liveSessionStore.selectedSnapshot

          if (!selectedSnapshot) {
            return
          }

          void sessionRuntimeCatalogStore.setToolAllowed(
            selectedSnapshot.sessionId,
            selectedSnapshot.settings,
            toolLlmId,
            allowed,
          )
        },
        refreshError: sessionRuntimeCatalogStore.refreshError,
        skills: sessionRuntimeCatalogStore.skills,
        tools: sessionRuntimeCatalogStore.tools,
        updatingToolLlmId: sessionRuntimeCatalogStore.updatingToolLlmId,
      },
      sessionStore,
      uiStore,
    }),
  )

  return <ContextPanel {...props} />
}
