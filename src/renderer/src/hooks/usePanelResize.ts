import { reaction } from 'mobx'
import { type PointerEvent as ReactPointerEvent, useCallback, useEffect, useRef } from 'react'

import type { UIStore } from '../stores/UIStore'

interface UsePanelResizeOptions {
  uiStore: UIStore
}

interface UsePanelResizeResult {
  startSidebarResize: (event: ReactPointerEvent<HTMLDivElement | HTMLButtonElement>) => void
  startContextPanelResize: (event: ReactPointerEvent<HTMLDivElement | HTMLButtonElement>) => void
}

export function usePanelResize({ uiStore }: UsePanelResizeOptions): UsePanelResizeResult {
  const sidebarCleanupRef = useRef<(() => void) | null>(null)
  const contextCleanupRef = useRef<(() => void) | null>(null)

  useEffect(() => {
    const syncCssVariables = () => {
      document.documentElement.style.setProperty(
        '--oxox-sidebar-width',
        `${uiStore.sidebarWidth}px`,
      )
      document.documentElement.style.setProperty(
        '--oxox-context-panel-width',
        `${uiStore.contextPanelWidth}px`,
      )
    }

    const syncWindowWidths = () => {
      uiStore.syncSidebarWidth()
      uiStore.syncContextPanelWidth()
      syncCssVariables()
    }

    syncWindowWidths()

    const stopSyncingSidebarWidth = reaction(() => uiStore.sidebarWidth, syncCssVariables)
    const stopSyncingContextPanelWidth = reaction(() => uiStore.contextPanelWidth, syncCssVariables)
    const stopSyncingSidebarClass = reaction(
      () => uiStore.isResizingSidebar,
      (isResizing) => {
        document.body.classList.toggle('oxox-sidebar-resizing', isResizing)
      },
    )
    const stopSyncingContextPanelClass = reaction(
      () => uiStore.isResizingContextPanel,
      (isResizing) => {
        document.body.classList.toggle('oxox-context-panel-resizing', isResizing)
      },
    )

    window.addEventListener('resize', syncWindowWidths)

    return () => {
      window.removeEventListener('resize', syncWindowWidths)
      stopSyncingSidebarWidth()
      stopSyncingContextPanelWidth()
      stopSyncingSidebarClass()
      stopSyncingContextPanelClass()
      sidebarCleanupRef.current?.()
      contextCleanupRef.current?.()
      document.body.classList.remove('oxox-sidebar-resizing')
      document.body.classList.remove('oxox-context-panel-resizing')
      document.documentElement.style.removeProperty('--oxox-sidebar-width')
      document.documentElement.style.removeProperty('--oxox-context-panel-width')
    }
  }, [uiStore])

  const startSidebarResize = useCallback(
    (event: ReactPointerEvent<HTMLDivElement | HTMLButtonElement>) => {
      event.preventDefault()
      uiStore.showSidebar()
      uiStore.setIsResizingSidebar(true)

      const handlePointerMove = (moveEvent: PointerEvent) => {
        uiStore.setSidebarWidth(moveEvent.clientX)
      }

      const cleanup = () => {
        uiStore.setIsResizingSidebar(false)
        window.removeEventListener('pointermove', handlePointerMove)
        window.removeEventListener('pointerup', cleanup)
        sidebarCleanupRef.current = null
      }

      sidebarCleanupRef.current?.()
      sidebarCleanupRef.current = cleanup

      window.addEventListener('pointermove', handlePointerMove)
      window.addEventListener('pointerup', cleanup)
    },
    [uiStore],
  )

  const startContextPanelResize = useCallback(
    (event: ReactPointerEvent<HTMLDivElement | HTMLButtonElement>) => {
      event.preventDefault()
      uiStore.showContextPanel()
      uiStore.setIsResizingContextPanel(true)

      const handlePointerMove = (moveEvent: PointerEvent) => {
        uiStore.setContextPanelWidth(window.innerWidth - moveEvent.clientX)
      }

      const cleanup = () => {
        uiStore.setIsResizingContextPanel(false)
        window.removeEventListener('pointermove', handlePointerMove)
        window.removeEventListener('pointerup', cleanup)
        contextCleanupRef.current = null
      }

      contextCleanupRef.current?.()
      contextCleanupRef.current = cleanup

      window.addEventListener('pointermove', handlePointerMove)
      window.addEventListener('pointerup', cleanup)
    },
    [uiStore],
  )

  return {
    startSidebarResize,
    startContextPanelResize,
  }
}
