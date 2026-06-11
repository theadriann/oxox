import { type Observable, observable } from '@legendapp/state'

export const SIDEBAR_STATE_STORAGE_KEY = 'oxox.ui.sidebar'
export const DEFAULT_SIDEBAR_WIDTH = 256
export const DEFAULT_CONTEXT_PANEL_WIDTH = 320
export const MIN_SIDEBAR_WIDTH = 200
export const MIN_CONTEXT_PANEL_WIDTH = 200

export type AppView = 'sessions' | 'settings' | 'search'
export type SettingsSection = 'general' | 'archive'
export type ContentLayout = 'fluid' | 'fixed'
export type ComposerContextUsageDisplayMode = 'percentage' | 'tokens'
export type ContextPanelMode = 'session-details' | 'git-diff'

export interface PersistedSidebarState {
  sidebarWidth?: number
  isSidebarHidden?: boolean
  contextPanelWidth?: number
  isContextPanelHidden?: boolean
  contextPanelMode?: ContextPanelMode
  collapsedProjectKeys?: string[]
  contentLayout?: ContentLayout
  composerContextUsageDisplayMode?: ComposerContextUsageDisplayMode
}

export interface UIState {
  sidebarWidth: number
  isSidebarHidden: boolean
  isResizingSidebar: boolean
  contextPanelWidth: number
  isContextPanelHidden: boolean
  contextPanelMode: ContextPanelMode
  isResizingContextPanel: boolean
  isCommandPaletteOpen: boolean
  collapsedProjectKeys: string[]
  contentLayout: ContentLayout
  composerContextUsageDisplayMode: ComposerContextUsageDisplayMode
  activeView: AppView
  settingsSection: SettingsSection
}

export function createDefaultUIState(): UIState {
  return {
    sidebarWidth: DEFAULT_SIDEBAR_WIDTH,
    isSidebarHidden: false,
    isResizingSidebar: false,
    contextPanelWidth: DEFAULT_CONTEXT_PANEL_WIDTH,
    isContextPanelHidden: false,
    contextPanelMode: 'session-details',
    isResizingContextPanel: false,
    isCommandPaletteOpen: false,
    collapsedProjectKeys: [],
    contentLayout: 'fixed',
    composerContextUsageDisplayMode: 'percentage',
    activeView: 'sessions',
    settingsSection: 'general',
  }
}

export function createUIState$(): Observable<UIState> {
  return observable(createDefaultUIState())
}
