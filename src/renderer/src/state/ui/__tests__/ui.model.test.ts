// @vitest-environment jsdom

import { observe } from '@legendapp/state'
import { beforeEach, describe, expect, it } from 'vitest'
import { createMemoryPersistencePort } from '../../../platform/persistence'
import { MIN_CONTEXT_PANEL_WIDTH, MIN_SIDEBAR_WIDTH, UIStore } from '../ui.model'

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
    store.setComposerContextUsageDisplayMode('tokens')
    store.toggleProjectCollapsed('project-alpha')
    store.toggleSidebar()
    store.toggleContextPanel()

    const restoredStore = new UIStore()

    expect(restoredStore.state$.sidebarWidth.get()).toBe(600)
    expect(restoredStore.state$.contextPanelWidth.get()).toBe(600)
    expect(restoredStore.state$.composerContextUsageDisplayMode.get()).toBe('tokens')
    expect(restoredStore.isProjectCollapsed('project-alpha')).toBe(true)
    expect(restoredStore.state$.isSidebarHidden.get()).toBe(true)
    expect(restoredStore.state$.isContextPanelHidden.get()).toBe(true)
  })

  it('enforces the minimum width clamp', () => {
    const store = new UIStore()

    store.setSidebarWidth(20)
    store.setContextPanelWidth(20)

    expect(store.state$.sidebarWidth.get()).toBe(MIN_SIDEBAR_WIDTH)
    expect(store.state$.contextPanelWidth.get()).toBe(MIN_CONTEXT_PANEL_WIDTH)
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

    expect(betaStore.state$.isSidebarHidden.get()).toBe(false)
    expect(betaStore.state$.sidebarWidth.get()).toBe(256)
    expect(betaStore.state$.isContextPanelHidden.get()).toBe(false)
    expect(betaStore.state$.contextPanelWidth.get()).toBe(320)

    betaStore.toggleProjectCollapsed('project-beta')

    window.history.replaceState({}, '', '?windowId=window-alpha')
    const restoredAlphaStore = new UIStore()

    expect(restoredAlphaStore.state$.isSidebarHidden.get()).toBe(true)
    expect(restoredAlphaStore.state$.sidebarWidth.get()).toBe(420)
    expect(restoredAlphaStore.state$.isContextPanelHidden.get()).toBe(true)
    expect(restoredAlphaStore.state$.contextPanelWidth.get()).toBe(420)
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
    expect(restoredAlphaStore.state$.isSidebarHidden.get()).toBe(true)
    expect(restoredAlphaStore.state$.sidebarWidth.get()).toBe(420)
    expect(betaStore.state$.isSidebarHidden.get()).toBe(false)
  })

  it('tracks transient resize flags and command palette state', () => {
    const store = new UIStore()

    expect(store.state$.isResizingSidebar.get()).toBe(false)
    expect(store.state$.isResizingContextPanel.get()).toBe(false)
    expect(store.state$.isCommandPaletteOpen.get()).toBe(false)

    store.setIsResizingSidebar(true)
    store.setIsResizingContextPanel(true)
    store.openCommandPalette()

    expect(store.state$.isResizingSidebar.get()).toBe(true)
    expect(store.state$.isResizingContextPanel.get()).toBe(true)
    expect(store.state$.isCommandPaletteOpen.get()).toBe(true)

    store.setIsResizingSidebar(false)
    store.setIsResizingContextPanel(false)
    store.closeCommandPalette()

    expect(store.state$.isResizingSidebar.get()).toBe(false)
    expect(store.state$.isResizingContextPanel.get()).toBe(false)
    expect(store.state$.isCommandPaletteOpen.get()).toBe(false)
  })

  it('exposes UI state as a Legend observable data graph', () => {
    const store = new UIStore()
    const observedHiddenStates: boolean[] = []
    const dispose = observe(() => {
      observedHiddenStates.push(store.state$.isSidebarHidden.get())
    })

    store.toggleSidebar()
    store.showSidebar()
    dispose()

    expect(observedHiddenStates).toEqual([false, true, false])
    expect(store).not.toHaveProperty('stateNode')
  })
})
