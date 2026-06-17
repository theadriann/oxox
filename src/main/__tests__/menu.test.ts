import { describe, expect, it, vi } from 'vitest'

import { buildMacApplicationMenuTemplate } from '../native/menu'

describe('buildMacApplicationMenuTemplate', () => {
  it('builds the macOS app, File, Edit, View, and Window menus with standard roles', () => {
    const onOpenNewWindow = vi.fn()
    const onQuit = vi.fn()
    const template = buildMacApplicationMenuTemplate('OXOX', { onOpenNewWindow, onQuit })

    expect(template.map((item) => item.label)).toEqual(['OXOX', 'File', 'Edit', 'View', 'Window'])

    const appMenu = template[0]?.submenu
    const fileMenu = template[1]?.submenu
    const editMenu = template[2]?.submenu
    const viewMenu = template[3]?.submenu
    const windowMenu = template[4]?.submenu

    expect(appMenu).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ role: 'about' }),
        expect.objectContaining({
          accelerator: 'Command+Q',
          label: 'Quit OXOX',
        }),
      ]),
    )
    expect(fileMenu).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          label: 'New Window',
          accelerator: 'CommandOrControl+N',
        }),
      ]),
    )
    expect(editMenu).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ role: 'undo' }),
        expect.objectContaining({ role: 'redo' }),
        expect.objectContaining({ role: 'cut' }),
        expect.objectContaining({ role: 'copy' }),
        expect.objectContaining({ role: 'paste' }),
        expect.objectContaining({ role: 'selectAll' }),
      ]),
    )
    expect(viewMenu).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ role: 'reload' }),
        expect.objectContaining({ role: 'forceReload' }),
        expect.objectContaining({ role: 'toggleDevTools' }),
        expect.objectContaining({ role: 'togglefullscreen' }),
      ]),
    )
    expect(windowMenu).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ role: 'minimize' }),
        expect.objectContaining({ role: 'zoom' }),
        expect.objectContaining({ role: 'front' }),
      ]),
    )

    const newWindowItem = Array.isArray(fileMenu)
      ? fileMenu.find((item) => item.label === 'New Window')
      : undefined
    const quitItem = Array.isArray(appMenu)
      ? appMenu.find((item) => item.label === 'Quit OXOX')
      : undefined

    newWindowItem?.click?.(undefined as never, undefined as never, undefined as never)
    quitItem?.click?.(undefined as never, undefined as never, undefined as never)
    expect(onOpenNewWindow).toHaveBeenCalledOnce()
    expect(onQuit).toHaveBeenCalledOnce()
  })
})
