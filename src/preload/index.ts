import { contextBridge, ipcRenderer } from 'electron'

import { createOxoxBridge } from './bridge'

contextBridge.exposeInMainWorld(
  'oxox',
  createOxoxBridge(
    (channel, ...args) => ipcRenderer.invoke(channel, ...args),
    (channel, listener) => ipcRenderer.on(channel, listener),
    (channel, listener) => ipcRenderer.off(channel, listener),
  ),
)
