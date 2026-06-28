import { describe, expect, it, vi } from 'vitest'

import { buildTrayMenuTemplate } from '../native/tray'

describe('buildTrayMenuTemplate', () => {
  it('creates Show OXOX and Quit actions for the menu bar tray', () => {
    const onShow = vi.fn()
    const onQuit = vi.fn()

    const template = buildTrayMenuTemplate({
      appName: 'OXOX',
      onQuit,
      onShow,
    })

    expect(template).toHaveLength(3)
    expect(template[0]).toMatchObject({ label: 'Show OXOX' })
    expect(template[2]).toMatchObject({ label: 'Quit' })

    template[0]?.click?.(undefined as never, undefined as never, undefined as never)
    template[2]?.click?.(undefined as never, undefined as never, undefined as never)

    expect(onShow).toHaveBeenCalledOnce()
    expect(onQuit).toHaveBeenCalledOnce()
  })
})
