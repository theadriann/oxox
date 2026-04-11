export interface FocusableWindow {
  isMinimized: () => boolean
  isVisible: () => boolean
  restore: () => void
  show: () => void
  focus: () => void
}

export function focusMainWindow(window: FocusableWindow | null | undefined): void {
  if (!window) {
    return
  }

  if (window.isMinimized()) {
    window.restore()
  }

  if (!window.isVisible()) {
    window.show()
  }

  window.focus()
}
