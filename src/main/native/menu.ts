import type { MenuItemConstructorOptions } from 'electron'
import { Menu } from 'electron'

export interface BuildMacApplicationMenuOptions {
  onOpenNewWindow?: () => void
  onQuit?: () => void
}

export function buildMacApplicationMenuTemplate(
  appName: string,
  { onOpenNewWindow, onQuit }: BuildMacApplicationMenuOptions = {},
): MenuItemConstructorOptions[] {
  return [
    {
      label: appName,
      submenu: [
        { role: 'about' },
        { type: 'separator' },
        { role: 'services' },
        { type: 'separator' },
        { role: 'hide' },
        { role: 'hideOthers' },
        { role: 'unhide' },
        { type: 'separator' },
        {
          label: `Quit ${appName}`,
          accelerator: 'Command+Q',
          click: () => onQuit?.(),
        },
      ],
    },
    {
      label: 'File',
      submenu: [
        {
          label: 'New Window',
          accelerator: 'CommandOrControl+N',
          click: () => onOpenNewWindow?.(),
        },
      ],
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'selectAll' },
      ],
    },
    {
      label: 'View',
      submenu: [
        { role: 'reload' },
        { role: 'forceReload' },
        { role: 'toggleDevTools' },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' },
      ],
    },
    {
      label: 'Window',
      submenu: [{ role: 'minimize' }, { role: 'zoom' }, { type: 'separator' }, { role: 'front' }],
    },
  ]
}

export function installMacApplicationMenu(
  appName: string,
  options: BuildMacApplicationMenuOptions = {},
): void {
  Menu.setApplicationMenu(Menu.buildFromTemplate(buildMacApplicationMenuTemplate(appName, options)))
}
