import type { PointerEvent as ReactPointerEvent, RefObject } from 'react'

import type { ContextPanelProps } from './ContextPanel'

export function buildContextPanelProps({
  foundationStore,
  liveSessionStore,
  onBrowseSessions,
  onResizeStart,
  panelRef,
  sessionRuntimeCatalogStore,
  sessionStore,
  uiStore,
}: {
  foundationStore: {
    hasError: boolean
    isLoading: boolean
    refresh: () => Promise<void> | void
  }
  liveSessionStore: {
    selectedSnapshot: ContextPanelProps['liveSession']
  }
  onBrowseSessions: () => void
  onResizeStart: (event: ReactPointerEvent<HTMLDivElement>) => void
  panelRef: RefObject<HTMLElement | null>
  sessionRuntimeCatalogStore: ContextPanelProps['runtimeCatalog']
  sessionStore: {
    selectedSession: ContextPanelProps['selectedSession']
  }
  uiStore: {
    contextPanelWidth: number
  }
}): ContextPanelProps {
  return {
    errorState: foundationStore.hasError
      ? {
          title: 'Unable to load session data',
          description: 'Retry to restore the latest context metadata from the main process.',
          actionLabel: 'Retry loading sessions',
          onAction: () => void foundationStore.refresh(),
        }
      : undefined,
    isLoading: foundationStore.isLoading,
    liveSession: liveSessionStore.selectedSnapshot,
    onBrowseSessions,
    onResizeStart,
    panelRef,
    runtimeCatalog: sessionRuntimeCatalogStore,
    selectedSession: sessionStore.selectedSession,
    width: uiStore.contextPanelWidth,
  }
}
