import { type PointerEvent as ReactPointerEvent, useCallback, useRef } from 'react'
import { observe } from '../stores/legend'
import type { UIStore } from '../stores/UIStore'
import { useMountEffect } from './useMountEffect'

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

  useMountEffect(() => {
    const stopSyncingDimensions = observe(() => {
      document.documentElement.style.setProperty(
        '--oxox-sidebar-width',
        `${uiStore.sidebarWidth}px`,
      )
      document.documentElement.style.setProperty(
        '--oxox-context-panel-width',
        `${uiStore.contextPanelWidth}px`,
      )
    })
    const stopSyncingResizeClasses = observe(() => {
      document.body.classList.toggle('oxox-sidebar-resizing', uiStore.isResizingSidebar)
      document.body.classList.toggle('oxox-context-panel-resizing', uiStore.isResizingContextPanel)
    })
    const syncWindowWidths = () => {
      uiStore.syncSidebarWidth()
      uiStore.syncContextPanelWidth()
    }

    syncWindowWidths()
    window.addEventListener('resize', syncWindowWidths)

    return () => {
      window.removeEventListener('resize', syncWindowWidths)
      stopSyncingDimensions()
      stopSyncingResizeClasses()
      sidebarCleanupRef.current?.()
      contextCleanupRef.current?.()
      document.body.classList.remove('oxox-sidebar-resizing')
      document.body.classList.remove('oxox-context-panel-resizing')
      document.documentElement.style.removeProperty('--oxox-sidebar-width')
      document.documentElement.style.removeProperty('--oxox-context-panel-width')
    }
  })

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
