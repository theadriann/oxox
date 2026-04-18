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
    const settingsSignature = selectedSnapshot
      ? JSON.stringify({
          autonomyLevel: selectedSnapshot.settings.autonomyLevel,
          autonomyMode: selectedSnapshot.settings.autonomyMode,
          disabledToolIds: selectedSnapshot.settings.disabledToolIds ?? [],
          enabledToolIds: selectedSnapshot.settings.enabledToolIds ?? [],
          interactionMode: selectedSnapshot.settings.interactionMode,
          modelId: selectedSnapshot.settings.modelId,
          specModeModelId: selectedSnapshot.settings.specModeModelId,
          specModeReasoningEffort: selectedSnapshot.settings.specModeReasoningEffort,
        })
      : ''

    if (isContextPanelHidden || !selectedSessionId) {
      sessionRuntimeCatalogStore.clear()
      return
    }

    void sessionRuntimeCatalogStore.refresh(
      selectedSessionId,
      `${selectedSessionId}:${settingsSignature}`,
    )
  })

  const props = useValue(() =>
    buildContextPanelProps({
      foundationStore,
      liveSessionStore,
      onBrowseSessions,
      onResizeStart,
      panelRef,
      sessionRuntimeCatalogStore: {
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
