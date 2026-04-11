import { describe, expect, it, vi } from 'vitest'

import { focusMainWindow } from '../lifecycle/singleInstance'

describe('focusMainWindow', () => {
  it('restores minimized windows before focusing them', () => {
    const restore = vi.fn()
    const focus = vi.fn()
    const show = vi.fn()

    focusMainWindow({
      isMinimized: () => true,
      isVisible: () => true,
      restore,
      show,
      focus,
    })

    expect(restore).toHaveBeenCalledOnce()
    expect(show).not.toHaveBeenCalled()
    expect(focus).toHaveBeenCalledOnce()
  })

  it('focuses non-minimized windows without restoring', () => {
    const restore = vi.fn()
    const focus = vi.fn()
    const show = vi.fn()

    focusMainWindow({
      isMinimized: () => false,
      isVisible: () => true,
      restore,
      show,
      focus,
    })

    expect(restore).not.toHaveBeenCalled()
    expect(show).not.toHaveBeenCalled()
    expect(focus).toHaveBeenCalledOnce()
  })

  it('shows hidden windows before focusing them', () => {
    const restore = vi.fn()
    const focus = vi.fn()
    const show = vi.fn()

    focusMainWindow({
      isMinimized: () => false,
      isVisible: () => false,
      restore,
      show,
      focus,
    })

    expect(restore).not.toHaveBeenCalled()
    expect(show).toHaveBeenCalledOnce()
    expect(focus).toHaveBeenCalledOnce()
  })
})
