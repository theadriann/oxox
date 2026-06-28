import { describe, expect, it } from 'vitest'

import { getWindowCloseAction } from '../windows/windowClosePolicy'

describe('getWindowCloseAction', () => {
  it('hides the only window when the close button is used', () => {
    const action = getWindowCloseAction({
      isAppQuitting: false,
      source: 'system-close',
      windowCount: 1,
    })

    expect(action).toBe('hide')
  })

  it('hides the only window when Cmd+W is used in single-window mode', () => {
    const action = getWindowCloseAction({
      isAppQuitting: false,
      source: 'command-close',
      windowCount: 1,
    })

    expect(action).toBe('hide')
  })

  it('allows Cmd+W to close the focused window when multiple windows are open', () => {
    const action = getWindowCloseAction({
      isAppQuitting: false,
      source: 'command-close',
      windowCount: 2,
    })

    expect(action).toBe('close')
  })

  it('allows the red traffic light to close the focused window when multiple windows are open', () => {
    const action = getWindowCloseAction({
      isAppQuitting: false,
      source: 'system-close',
      windowCount: 2,
    })

    expect(action).toBe('close')
  })

  it('always allows the close event to proceed while the app is quitting', () => {
    const action = getWindowCloseAction({
      isAppQuitting: true,
      source: 'system-close',
      windowCount: 1,
    })

    expect(action).toBe('close')
  })
})
