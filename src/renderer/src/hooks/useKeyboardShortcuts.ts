import { useRef } from 'react'

import { useMountEffect } from './useMountEffect'

export interface KeyboardShortcutDefinition {
  id: string
  key: string
  altKey?: boolean
  shiftKey?: boolean
  metaOrCtrl?: boolean
  when?: boolean | (() => boolean)
  preventDefault?: boolean
  allowInEditable?: boolean
  handler: (event: KeyboardEvent) => void
}

export function useKeyboardShortcuts(shortcuts: KeyboardShortcutDefinition[]): void {
  const shortcutsRef = useRef(shortcuts)
  shortcutsRef.current = shortcuts

  useMountEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      for (const shortcut of shortcutsRef.current) {
        const isEnabled =
          typeof shortcut.when === 'function' ? shortcut.when() : shortcut.when !== false

        if (!isEnabled) {
          continue
        }

        if (!matchesShortcut(event, shortcut)) {
          continue
        }

        if (!shortcut.allowInEditable && isEditableTarget(event.target)) {
          continue
        }

        if (shortcut.preventDefault !== false) {
          event.preventDefault()
        }

        shortcut.handler(event)
        break
      }
    }

    window.addEventListener('keydown', handleKeyDown)

    return () => {
      window.removeEventListener('keydown', handleKeyDown)
    }
  })
}

function matchesShortcut(event: KeyboardEvent, shortcut: KeyboardShortcutDefinition): boolean {
  if (event.key.toLowerCase() !== shortcut.key.toLowerCase()) {
    return false
  }

  if (Boolean(shortcut.metaOrCtrl) !== Boolean(event.metaKey || event.ctrlKey)) {
    return false
  }

  if (Boolean(shortcut.altKey) !== event.altKey) {
    return false
  }

  if (Boolean(shortcut.shiftKey) !== event.shiftKey) {
    return false
  }

  return true
}

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) {
    return false
  }

  if (target.isContentEditable) {
    return true
  }

  return (
    target instanceof HTMLInputElement ||
    target instanceof HTMLSelectElement ||
    target instanceof HTMLTextAreaElement
  )
}
