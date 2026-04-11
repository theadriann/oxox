import type { MenuItemConstructorOptions } from 'electron'
import { Menu, Tray } from 'electron'
import { createTrayIcon } from './appIcon'

export interface TrayMenuOptions {
  appName: string
  onQuit: () => void
  onShow: () => void
}

export function buildTrayMenuTemplate({
  appName,
  onQuit,
  onShow,
}: TrayMenuOptions): MenuItemConstructorOptions[] {
  return [
    {
      label: `Show ${appName}`,
      click: () => onShow(),
    },
    { type: 'separator' },
    {
      label: 'Quit',
      click: () => onQuit(),
    },
  ]
}

export function createSystemTray(options: TrayMenuOptions): Tray {
  const tray = new Tray(createTrayIcon())
  tray.setToolTip(options.appName)
  tray.setContextMenu(Menu.buildFromTemplate(buildTrayMenuTemplate(options)))
  tray.on('click', options.onShow)

  return tray
}
