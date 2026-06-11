import type { UIStore } from '../../state/ui/ui.model'

interface AppShellKeyboardShortcutsOptions {
  composerStore: {
    canAttachSelected: boolean
    detachSelected: () => Promise<void>
  }
  liveSessionStore: {
    selectedSnapshot: unknown
  }
  newSessionForm: {
    closeForm: () => void
    showForm: boolean
  }
  uiStore: UIStore
  closeCommandPalette: () => void
  openCommandPalette: () => void
  onAttachSelectedSession: () => void
  onFocusContextPanelToggle: () => void
  onOpenSettings: () => void
  onOpenSearch: () => void
}

export function createAppShellKeyboardShortcuts({
  composerStore,
  closeCommandPalette,
  liveSessionStore,
  newSessionForm,
  openCommandPalette,
  uiStore,
  onAttachSelectedSession,
  onFocusContextPanelToggle,
  onOpenSearch,
  onOpenSettings,
}: AppShellKeyboardShortcutsOptions) {
  return [
    { id: 'open-settings', key: ',', metaOrCtrl: true, handler: onOpenSettings },
    { id: 'open-command-palette', key: 'k', metaOrCtrl: true, handler: openCommandPalette },
    {
      id: 'open-full-page-search',
      key: 'f',
      metaOrCtrl: true,
      shiftKey: true,
      handler: onOpenSearch,
    },
    { id: 'toggle-sidebar', key: 'b', metaOrCtrl: true, handler: uiStore.toggleSidebar },
    {
      id: 'toggle-context-panel',
      key: 'p',
      metaOrCtrl: true,
      altKey: true,
      handler: uiStore.toggleContextPanel,
    },
    {
      id: 'toggle-session-attachment',
      key: 'a',
      metaOrCtrl: true,
      shiftKey: true,
      when: () => Boolean(liveSessionStore.selectedSnapshot || composerStore.canAttachSelected),
      handler: () => {
        if (liveSessionStore.selectedSnapshot) {
          void composerStore.detachSelected()
          return
        }
        onAttachSelectedSession()
      },
    },
    {
      id: 'dismiss-surface',
      key: 'escape',
      allowInEditable: true,
      handler: () => {
        if (uiStore.state$.isCommandPaletteOpen.get()) return closeCommandPalette()
        if (uiStore.isSearchOpen()) return uiStore.closeSearch()
        if (newSessionForm.showForm) return newSessionForm.closeForm()
        if (!uiStore.state$.isContextPanelHidden.get()) {
          uiStore.toggleContextPanel()
          onFocusContextPanelToggle()
        }
      },
    },
  ]
}
