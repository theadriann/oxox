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
  uiStore: {
    isCommandPaletteOpen: boolean
    isContextPanelHidden: boolean
    toggleContextPanel: () => void
    toggleSidebar: () => void
  }
  closeCommandPalette: () => void
  openCommandPalette: () => void
  onAttachSelectedSession: () => void
  onFocusContextPanelToggle: () => void
  onOpenSettings: () => void
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
  onOpenSettings,
}: AppShellKeyboardShortcutsOptions) {
  return [
    { id: 'open-settings', key: ',', metaOrCtrl: true, handler: onOpenSettings },
    { id: 'open-command-palette', key: 'k', metaOrCtrl: true, handler: openCommandPalette },
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
        if (uiStore.isCommandPaletteOpen) return closeCommandPalette()
        if (newSessionForm.showForm) return newSessionForm.closeForm()
        if (!uiStore.isContextPanelHidden) {
          uiStore.toggleContextPanel()
          onFocusContextPanelToggle()
        }
      },
    },
  ]
}
