// @vitest-environment jsdom

import { beforeEach, describe, expect, it } from 'vitest'

import { createMemoryPersistencePort } from '../../platform/persistence'
import { MIN_CONTEXT_PANEL_WIDTH, MIN_SIDEBAR_WIDTH, UIStore } from '../UIStore'

describe('UIStore', () => {
  beforeEach(() => {
    window.localStorage.clear()
    window.history.replaceState({}, '', '?windowId=window-1')
    Object.defineProperty(window, 'innerWidth', {
      configurable: true,
      value: 1200,
    })
  })

  it('persists sidebar and context panel state', () => {
    const store = new UIStore()

    store.setSidebarWidth(900)
    store.setContextPanelWidth(900)
    store.toggleProjectCollapsed('project-alpha')
    store.toggleSidebar()
    store.toggleContextPanel()

    const restoredStore = new UIStore()

    expect(restoredStore.sidebarWidth).toBe(600)
    expect(restoredStore.contextPanelWidth).toBe(600)
    expect(restoredStore.isProjectCollapsed('project-alpha')).toBe(true)
    expect(restoredStore.isSidebarHidden).toBe(true)
    expect(restoredStore.isContextPanelHidden).toBe(true)
  })

  it('enforces the minimum width clamp', () => {
    const store = new UIStore()

    store.setSidebarWidth(20)
    store.setContextPanelWidth(20)

    expect(store.sidebarWidth).toBe(MIN_SIDEBAR_WIDTH)
    expect(store.contextPanelWidth).toBe(MIN_CONTEXT_PANEL_WIDTH)
  })

  it('persists independent sidebar state for each window scope', () => {
    window.history.replaceState({}, '', '?windowId=window-alpha')
    const alphaStore = new UIStore()
    alphaStore.toggleSidebar()
    alphaStore.setSidebarWidth(420)
    alphaStore.toggleContextPanel()
    alphaStore.setContextPanelWidth(420)

    window.history.replaceState({}, '', '?windowId=window-beta')
    const betaStore = new UIStore()

    expect(betaStore.isSidebarHidden).toBe(false)
    expect(betaStore.sidebarWidth).toBe(256)
    expect(betaStore.isContextPanelHidden).toBe(false)
    expect(betaStore.contextPanelWidth).toBe(320)

    betaStore.toggleProjectCollapsed('project-beta')

    window.history.replaceState({}, '', '?windowId=window-alpha')
    const restoredAlphaStore = new UIStore()

    expect(restoredAlphaStore.isSidebarHidden).toBe(true)
    expect(restoredAlphaStore.sidebarWidth).toBe(420)
    expect(restoredAlphaStore.isContextPanelHidden).toBe(true)
    expect(restoredAlphaStore.contextPanelWidth).toBe(420)
    expect(restoredAlphaStore.isProjectCollapsed('project-beta')).toBe(false)
  })

  it('persists per-window UI state through an injected persistence port', () => {
    const persistence = createMemoryPersistencePort()

    window.history.replaceState({}, '', '?windowId=window-alpha')
    const alphaStore = new UIStore(persistence)
    alphaStore.toggleSidebar()
    alphaStore.setSidebarWidth(420)

    window.history.replaceState({}, '', '?windowId=window-beta')
    const betaStore = new UIStore(persistence)

    window.history.replaceState({}, '', '?windowId=window-alpha')
    const restoredAlphaStore = new UIStore(persistence)

    expect(persistence.get('oxox.ui.sidebar:window-alpha', {})).toEqual(
      expect.objectContaining({
        isSidebarHidden: true,
        sidebarWidth: 420,
      }),
    )
    expect(restoredAlphaStore.isSidebarHidden).toBe(true)
    expect(restoredAlphaStore.sidebarWidth).toBe(420)
    expect(betaStore.isSidebarHidden).toBe(false)
  })

  it('tracks transient resize flags and command palette state', () => {
    const store = new UIStore()

    expect(store.isResizingSidebar).toBe(false)
    expect(store.isResizingContextPanel).toBe(false)
    expect(store.isCommandPaletteOpen).toBe(false)

    store.setIsResizingSidebar(true)
    store.setIsResizingContextPanel(true)
    store.openCommandPalette()

    expect(store.isResizingSidebar).toBe(true)
    expect(store.isResizingContextPanel).toBe(true)
    expect(store.isCommandPaletteOpen).toBe(true)

    store.setIsResizingSidebar(false)
    store.setIsResizingContextPanel(false)
    store.closeCommandPalette()

    expect(store.isResizingSidebar).toBe(false)
    expect(store.isResizingContextPanel).toBe(false)
    expect(store.isCommandPaletteOpen).toBe(false)
  })
})
