import { app, nativeTheme } from 'electron'

import type { RuntimeInfo, RuntimePlatform } from '../../shared/ipc/contracts'

function resolvePlatform(): RuntimePlatform {
  if (
    process.platform === 'darwin' ||
    process.platform === 'linux' ||
    process.platform === 'win32'
  ) {
    return process.platform
  }

  return 'darwin'
}

export function getRuntimeInfo(): RuntimeInfo {
  return {
    appVersion: app.getVersion(),
    chromeVersion: process.versions.chrome,
    electronVersion: process.versions.electron,
    nodeVersion: process.versions.node,
    platform: resolvePlatform(),
    isDarkModeForced: nativeTheme.themeSource === 'dark',
    hasRequire: false,
    hasProcess: false,
  }
}
