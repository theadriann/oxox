// @vitest-environment jsdom

import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { UIStore } from '../../stores/UIStore'
import { usePanelResize } from '../usePanelResize'

function PanelResizeProbe({ uiStore }: { uiStore: UIStore }) {
  const { startSidebarResize, startContextPanelResize } = usePanelResize({ uiStore })

  return (
    <>
      <button onPointerDown={startSidebarResize} type="button">
        Start sidebar resize
      </button>
      <button onPointerDown={startContextPanelResize} type="button">
        Start context resize
      </button>
    </>
  )
}

describe('usePanelResize', () => {
  beforeEach(() => {
    window.localStorage.clear()
    Object.defineProperty(window, 'innerWidth', {
      configurable: true,
      value: 1200,
    })
  })

  it('syncs panel css variables and drives sidebar resize state', async () => {
    const uiStore = new UIStore()

    render(<PanelResizeProbe uiStore={uiStore} />)

    expect(document.documentElement.style.getPropertyValue('--oxox-sidebar-width')).toBe('256px')
    expect(document.documentElement.style.getPropertyValue('--oxox-context-panel-width')).toBe(
      '320px',
    )

    fireEvent.pointerDown(screen.getByRole('button', { name: /start sidebar resize/i }), {
      clientX: 256,
    })

    await waitFor(() => {
      expect(document.body.classList.contains('oxox-sidebar-resizing')).toBe(true)
    })

    fireEvent.pointerMove(window, { clientX: 420 })
    expect(uiStore.sidebarWidth).toBe(420)

    fireEvent.pointerUp(window)

    await waitFor(() => {
      expect(document.body.classList.contains('oxox-sidebar-resizing')).toBe(false)
    })
  })

  it('drives context panel resize state from pointer events', async () => {
    const uiStore = new UIStore()

    render(<PanelResizeProbe uiStore={uiStore} />)

    fireEvent.pointerDown(screen.getByRole('button', { name: /start context resize/i }), {
      clientX: 900,
    })

    await waitFor(() => {
      expect(document.body.classList.contains('oxox-context-panel-resizing')).toBe(true)
    })

    fireEvent.pointerMove(window, { clientX: 850 })
    expect(uiStore.contextPanelWidth).toBe(350)

    fireEvent.pointerUp(window)

    await waitFor(() => {
      expect(document.body.classList.contains('oxox-context-panel-resizing')).toBe(false)
    })
  })
})
