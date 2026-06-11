import { batch, type Observable } from '@legendapp/state'
import { createLocalStoragePort, type PersistencePort } from '../../platform/persistence'
import {
  type ComposerContextUsageDisplayMode,
  type ContentLayout,
  type ContextPanelMode,
  createUIState$,
  DEFAULT_CONTEXT_PANEL_WIDTH,
  DEFAULT_SIDEBAR_WIDTH,
  MIN_CONTEXT_PANEL_WIDTH,
  MIN_SIDEBAR_WIDTH,
  type PersistedSidebarState,
  type SettingsSection,
  SIDEBAR_STATE_STORAGE_KEY,
  type UIState,
} from './ui.state'

export type {
  AppView,
  ComposerContextUsageDisplayMode,
  ContentLayout,
  ContextPanelMode,
  SettingsSection,
  UIState,
} from './ui.state'
export {
  DEFAULT_CONTEXT_PANEL_WIDTH,
  DEFAULT_SIDEBAR_WIDTH,
  MIN_CONTEXT_PANEL_WIDTH,
  MIN_SIDEBAR_WIDTH,
} from './ui.state'

export class UIStore {
  readonly colorMode = 'dark'
  readonly isCommandPaletteReady = true
  readonly state$: Observable<UIState> = createUIState$()
  private readonly persistence: PersistencePort

  constructor(persistence: PersistencePort = createLocalStoragePort()) {
    this.persistence = persistence
    this.hydrate()
  }

  setSidebarWidth = (width: number, windowWidth = getWindowWidth()): void => {
    this.state$.sidebarWidth.set(clampSidebarWidth(width, windowWidth))
    this.persist()
  }

  syncSidebarWidth = (windowWidth = getWindowWidth()): void => {
    const clampedWidth = clampSidebarWidth(this.state$.sidebarWidth.get(), windowWidth)

    if (clampedWidth === this.state$.sidebarWidth.get()) {
      return
    }

    this.state$.sidebarWidth.set(clampedWidth)
    this.persist()
  }

  setContextPanelWidth = (width: number, windowWidth = getWindowWidth()): void => {
    this.state$.contextPanelWidth.set(clampContextPanelWidth(width, windowWidth))
    this.persist()
  }

  syncContextPanelWidth = (windowWidth = getWindowWidth()): void => {
    const clampedWidth = clampContextPanelWidth(this.state$.contextPanelWidth.get(), windowWidth)

    if (clampedWidth === this.state$.contextPanelWidth.get()) {
      return
    }

    this.state$.contextPanelWidth.set(clampedWidth)
    this.persist()
  }

  toggleSidebar = (): void => {
    this.state$.isSidebarHidden.set((isHidden) => !isHidden)
    this.persist()
  }

  showSidebar = (): void => {
    if (!this.state$.isSidebarHidden.get()) {
      return
    }

    this.state$.isSidebarHidden.set(false)
    this.persist()
  }

  setIsResizingSidebar = (value: boolean): void => {
    this.state$.isResizingSidebar.set(value)
  }

  toggleContextPanel = (): void => {
    this.state$.isContextPanelHidden.set((isHidden) => !isHidden)
    this.persist()
  }

  showContextPanel = (): void => {
    if (!this.state$.isContextPanelHidden.get()) {
      return
    }

    this.state$.isContextPanelHidden.set(false)
    this.persist()
  }

  setContextPanelMode = (mode: ContextPanelMode): void => {
    batch(() => {
      this.state$.contextPanelMode.set(mode)
      this.state$.isContextPanelHidden.set(false)
    })
    this.persist()
  }

  toggleContextPanelMode = (mode: ContextPanelMode): void => {
    const isActiveVisible =
      this.state$.contextPanelMode.get() === mode && !this.state$.isContextPanelHidden.get()

    batch(() => {
      this.state$.contextPanelMode.set(mode)
      this.state$.isContextPanelHidden.set(isActiveVisible)
    })
    this.persist()
  }

  setIsResizingContextPanel = (value: boolean): void => {
    this.state$.isResizingContextPanel.set(value)
  }

  openCommandPalette = (): void => {
    this.state$.isCommandPaletteOpen.set(true)
  }

  closeCommandPalette = (): void => {
    this.state$.isCommandPaletteOpen.set(false)
  }

  openSettings = (section?: SettingsSection): void => {
    batch(() => {
      this.state$.activeView.set('settings')
      if (section) this.state$.settingsSection.set(section)
    })
  }

  openSearch = (): void => {
    this.state$.activeView.set('search')
  }

  closeSearch = (): void => {
    this.state$.activeView.set('sessions')
  }

  isSearchOpen = (): boolean => {
    return this.state$.activeView.get() === 'search'
  }

  closeSettings = (): void => {
    this.state$.assign({
      activeView: 'sessions',
      settingsSection: 'general',
    })
  }

  setSettingsSection = (section: SettingsSection): void => {
    this.state$.settingsSection.set(section)
  }

  isSettingsOpen = (): boolean => {
    return this.state$.activeView.get() === 'settings'
  }

  toggleContentLayout = (): void => {
    this.state$.contentLayout.set((layout) => (layout === 'fluid' ? 'fixed' : 'fluid'))
    this.persist()
  }

  setContentLayout = (layout: ContentLayout): void => {
    this.state$.contentLayout.set(layout)
    this.persist()
  }

  setComposerContextUsageDisplayMode = (mode: ComposerContextUsageDisplayMode): void => {
    this.state$.composerContextUsageDisplayMode.set(mode)
    this.persist()
  }

  isProjectCollapsed = (projectKey: string): boolean => {
    return this.state$.collapsedProjectKeys.get().includes(projectKey)
  }

  toggleProjectCollapsed = (projectKey: string): void => {
    const index = this.state$.collapsedProjectKeys.get().indexOf(projectKey)

    if (index >= 0) {
      this.state$.collapsedProjectKeys[index].delete()
      this.persist()
      return
    }

    this.state$.collapsedProjectKeys.push(projectKey)
    this.persist()
  }

  private hydrate(): void {
    const nextState = readPersistedSidebarState(this.persistence)

    batch(() => {
      this.state$.assign({
        sidebarWidth: clampSidebarWidth(nextState.sidebarWidth ?? DEFAULT_SIDEBAR_WIDTH),
        isSidebarHidden: nextState.isSidebarHidden ?? false,
        contextPanelWidth: clampContextPanelWidth(
          nextState.contextPanelWidth ?? DEFAULT_CONTEXT_PANEL_WIDTH,
        ),
        isContextPanelHidden: nextState.isContextPanelHidden ?? false,
        contextPanelMode:
          nextState.contextPanelMode === 'git-diff' ? 'git-diff' : 'session-details',
        collapsedProjectKeys: nextState.collapsedProjectKeys ?? [],
        contentLayout: nextState.contentLayout === 'fluid' ? 'fluid' : 'fixed',
        composerContextUsageDisplayMode:
          nextState.composerContextUsageDisplayMode === 'tokens' ? 'tokens' : 'percentage',
      })
    })
  }

  private persist(): void {
    const current = this.state$.peek()
    const state: PersistedSidebarState = {
      sidebarWidth: current.sidebarWidth,
      isSidebarHidden: current.isSidebarHidden,
      contextPanelWidth: current.contextPanelWidth,
      isContextPanelHidden: current.isContextPanelHidden,
      contextPanelMode: current.contextPanelMode,
      collapsedProjectKeys: [...current.collapsedProjectKeys],
      contentLayout: current.contentLayout,
      composerContextUsageDisplayMode: current.composerContextUsageDisplayMode,
    }

    this.persistence.set(getSidebarStateStorageKey(), state)
  }
}

export function clampSidebarWidth(width: number, windowWidth = getWindowWidth()): number {
  const safeWindowWidth = Number.isFinite(windowWidth) && windowWidth > 0 ? windowWidth : 1440
  const maxWidth = Math.max(MIN_SIDEBAR_WIDTH, Math.floor(safeWindowWidth * 0.5))
  const safeWidth = Number.isFinite(width) ? Math.round(width) : DEFAULT_SIDEBAR_WIDTH

  return Math.min(maxWidth, Math.max(MIN_SIDEBAR_WIDTH, safeWidth))
}

export function clampContextPanelWidth(width: number, windowWidth = getWindowWidth()): number {
  const safeWindowWidth = Number.isFinite(windowWidth) && windowWidth > 0 ? windowWidth : 1440
  const maxWidth = Math.max(MIN_CONTEXT_PANEL_WIDTH, Math.floor(safeWindowWidth * 0.5))
  const safeWidth = Number.isFinite(width) ? Math.round(width) : DEFAULT_CONTEXT_PANEL_WIDTH

  return Math.min(maxWidth, Math.max(MIN_CONTEXT_PANEL_WIDTH, safeWidth))
}

function getWindowWidth(): number {
  if (typeof window === 'undefined') {
    return 1440
  }

  return window.innerWidth
}

function readPersistedSidebarState(persistence: PersistencePort): PersistedSidebarState {
  try {
    const parsed = persistence.get<PersistedSidebarState>(getSidebarStateStorageKey(), {})

    return {
      sidebarWidth: parsed.sidebarWidth,
      isSidebarHidden: parsed.isSidebarHidden,
      contextPanelWidth: parsed.contextPanelWidth,
      isContextPanelHidden: parsed.isContextPanelHidden,
      contextPanelMode: parsed.contextPanelMode,
      contentLayout: parsed.contentLayout,
      composerContextUsageDisplayMode: parsed.composerContextUsageDisplayMode,
      collapsedProjectKeys: Array.isArray(parsed.collapsedProjectKeys)
        ? parsed.collapsedProjectKeys.filter((value): value is string => typeof value === 'string')
        : [],
    }
  } catch {
    return {}
  }
}

function getSidebarStateStorageKey(): string {
  return `${SIDEBAR_STATE_STORAGE_KEY}:${getWindowPersistenceScope()}`
}

function getWindowPersistenceScope(): string {
  if (typeof window === 'undefined') {
    return 'window-1'
  }

  const scope = new URLSearchParams(window.location.search).get('windowId')?.trim()
  return scope && scope.length > 0 ? scope : 'window-1'
}
