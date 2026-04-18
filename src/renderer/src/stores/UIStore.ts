import { createLocalStoragePort, type PersistencePort } from '../platform/persistence'
import { bindMethods, observable, readField, writeField } from './legend'

const SIDEBAR_STATE_STORAGE_KEY = 'oxox.ui.sidebar'
const DEFAULT_SIDEBAR_WIDTH = 256
const DEFAULT_CONTEXT_PANEL_WIDTH = 320
export const MIN_SIDEBAR_WIDTH = 200
export const MIN_CONTEXT_PANEL_WIDTH = 200

interface PersistedSidebarState {
  sidebarWidth?: number
  isSidebarHidden?: boolean
  contextPanelWidth?: number
  isContextPanelHidden?: boolean
  collapsedProjectKeys?: string[]
  contentLayout?: ContentLayout
  composerContextUsageDisplayMode?: ComposerContextUsageDisplayMode
}

export type AppView = 'sessions' | 'settings'
export type SettingsSection = 'general' | 'archive'
export type ContentLayout = 'fluid' | 'fixed'
export type ComposerContextUsageDisplayMode = 'percentage' | 'tokens'

export class UIStore {
  readonly colorMode = 'dark'
  readonly isCommandPaletteReady = true
  readonly stateNode = observable({
    sidebarWidth: DEFAULT_SIDEBAR_WIDTH,
    isSidebarHidden: false,
    isResizingSidebar: false,
    contextPanelWidth: DEFAULT_CONTEXT_PANEL_WIDTH,
    isContextPanelHidden: false,
    isResizingContextPanel: false,
    isCommandPaletteOpen: false,
    collapsedProjectKeys: [] as string[],
    contentLayout: 'fixed' as ContentLayout,
    composerContextUsageDisplayMode: 'percentage' as ComposerContextUsageDisplayMode,
    activeView: 'sessions' as AppView,
    settingsSection: 'general' as SettingsSection,
  })
  private readonly persistence: PersistencePort

  constructor(persistence: PersistencePort = createLocalStoragePort()) {
    this.persistence = persistence
    bindMethods(this)
    this.hydrate()
  }

  get sidebarWidth(): number {
    return readField(this.stateNode, 'sidebarWidth')
  }

  set sidebarWidth(value: number) {
    writeField(this.stateNode, 'sidebarWidth', value)
  }

  get isSidebarHidden(): boolean {
    return readField(this.stateNode, 'isSidebarHidden')
  }

  set isSidebarHidden(value: boolean) {
    writeField(this.stateNode, 'isSidebarHidden', value)
  }

  get isResizingSidebar(): boolean {
    return readField(this.stateNode, 'isResizingSidebar')
  }

  set isResizingSidebar(value: boolean) {
    writeField(this.stateNode, 'isResizingSidebar', value)
  }

  get contextPanelWidth(): number {
    return readField(this.stateNode, 'contextPanelWidth')
  }

  set contextPanelWidth(value: number) {
    writeField(this.stateNode, 'contextPanelWidth', value)
  }

  get isContextPanelHidden(): boolean {
    return readField(this.stateNode, 'isContextPanelHidden')
  }

  set isContextPanelHidden(value: boolean) {
    writeField(this.stateNode, 'isContextPanelHidden', value)
  }

  get isResizingContextPanel(): boolean {
    return readField(this.stateNode, 'isResizingContextPanel')
  }

  set isResizingContextPanel(value: boolean) {
    writeField(this.stateNode, 'isResizingContextPanel', value)
  }

  get isCommandPaletteOpen(): boolean {
    return readField(this.stateNode, 'isCommandPaletteOpen')
  }

  set isCommandPaletteOpen(value: boolean) {
    writeField(this.stateNode, 'isCommandPaletteOpen', value)
  }

  get collapsedProjectKeys(): string[] {
    return readField(this.stateNode, 'collapsedProjectKeys')
  }

  set collapsedProjectKeys(value: string[]) {
    writeField(this.stateNode, 'collapsedProjectKeys', value)
  }

  get contentLayout(): ContentLayout {
    return readField(this.stateNode, 'contentLayout')
  }

  set contentLayout(value: ContentLayout) {
    writeField(this.stateNode, 'contentLayout', value)
  }

  get composerContextUsageDisplayMode(): ComposerContextUsageDisplayMode {
    return readField(this.stateNode, 'composerContextUsageDisplayMode')
  }

  set composerContextUsageDisplayMode(value: ComposerContextUsageDisplayMode) {
    writeField(this.stateNode, 'composerContextUsageDisplayMode', value)
  }

  get activeView(): AppView {
    return readField(this.stateNode, 'activeView')
  }

  set activeView(value: AppView) {
    writeField(this.stateNode, 'activeView', value)
  }

  get settingsSection(): SettingsSection {
    return readField(this.stateNode, 'settingsSection')
  }

  set settingsSection(value: SettingsSection) {
    writeField(this.stateNode, 'settingsSection', value)
  }

  setSidebarWidth(width: number, windowWidth = getWindowWidth()): void {
    this.sidebarWidth = clampSidebarWidth(width, windowWidth)
    this.persist()
  }

  syncSidebarWidth(windowWidth = getWindowWidth()): void {
    const clampedWidth = clampSidebarWidth(this.sidebarWidth, windowWidth)

    if (clampedWidth === this.sidebarWidth) {
      return
    }

    this.sidebarWidth = clampedWidth
    this.persist()
  }

  setContextPanelWidth(width: number, windowWidth = getWindowWidth()): void {
    this.contextPanelWidth = clampContextPanelWidth(width, windowWidth)
    this.persist()
  }

  syncContextPanelWidth(windowWidth = getWindowWidth()): void {
    const clampedWidth = clampContextPanelWidth(this.contextPanelWidth, windowWidth)

    if (clampedWidth === this.contextPanelWidth) {
      return
    }

    this.contextPanelWidth = clampedWidth
    this.persist()
  }

  toggleSidebar(): void {
    this.isSidebarHidden = !this.isSidebarHidden
    this.persist()
  }

  showSidebar(): void {
    if (!this.isSidebarHidden) {
      return
    }

    this.isSidebarHidden = false
    this.persist()
  }

  setIsResizingSidebar(value: boolean): void {
    this.isResizingSidebar = value
  }

  toggleContextPanel(): void {
    this.isContextPanelHidden = !this.isContextPanelHidden
    this.persist()
  }

  showContextPanel(): void {
    if (!this.isContextPanelHidden) {
      return
    }

    this.isContextPanelHidden = false
    this.persist()
  }

  setIsResizingContextPanel(value: boolean): void {
    this.isResizingContextPanel = value
  }

  openCommandPalette(): void {
    this.isCommandPaletteOpen = true
  }

  closeCommandPalette(): void {
    this.isCommandPaletteOpen = false
  }

  openSettings(section?: SettingsSection): void {
    this.activeView = 'settings'
    if (section) this.settingsSection = section
  }

  closeSettings(): void {
    this.activeView = 'sessions'
    this.settingsSection = 'general'
  }

  setSettingsSection(section: SettingsSection): void {
    this.settingsSection = section
  }

  get isSettingsOpen(): boolean {
    return this.activeView === 'settings'
  }

  toggleContentLayout(): void {
    this.contentLayout = this.contentLayout === 'fluid' ? 'fixed' : 'fluid'
    this.persist()
  }

  setContentLayout(layout: ContentLayout): void {
    this.contentLayout = layout
    this.persist()
  }

  setComposerContextUsageDisplayMode(mode: ComposerContextUsageDisplayMode): void {
    this.composerContextUsageDisplayMode = mode
    this.persist()
  }

  isProjectCollapsed(projectKey: string): boolean {
    return this.collapsedProjectKeys.includes(projectKey)
  }

  toggleProjectCollapsed(projectKey: string): void {
    if (this.isProjectCollapsed(projectKey)) {
      this.collapsedProjectKeys = this.collapsedProjectKeys.filter((key) => key !== projectKey)
      this.persist()
      return
    }

    this.collapsedProjectKeys = [...this.collapsedProjectKeys, projectKey]
    this.persist()
  }

  private hydrate(): void {
    const nextState = readPersistedSidebarState(this.persistence)

    this.sidebarWidth = clampSidebarWidth(nextState.sidebarWidth ?? DEFAULT_SIDEBAR_WIDTH)
    this.isSidebarHidden = nextState.isSidebarHidden ?? false
    this.contextPanelWidth = clampContextPanelWidth(
      nextState.contextPanelWidth ?? DEFAULT_CONTEXT_PANEL_WIDTH,
    )
    this.isContextPanelHidden = nextState.isContextPanelHidden ?? false
    this.collapsedProjectKeys = nextState.collapsedProjectKeys ?? []
    this.contentLayout = nextState.contentLayout === 'fluid' ? 'fluid' : 'fixed'
    this.composerContextUsageDisplayMode =
      nextState.composerContextUsageDisplayMode === 'tokens' ? 'tokens' : 'percentage'
  }

  private persist(): void {
    const state: PersistedSidebarState = {
      sidebarWidth: this.sidebarWidth,
      isSidebarHidden: this.isSidebarHidden,
      contextPanelWidth: this.contextPanelWidth,
      isContextPanelHidden: this.isContextPanelHidden,
      collapsedProjectKeys: this.collapsedProjectKeys,
      contentLayout: this.contentLayout,
      composerContextUsageDisplayMode: this.composerContextUsageDisplayMode,
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
