import type { BrowserWindowConstructorOptions, Rectangle } from 'electron'

export const MAIN_WINDOW_MIN_WIDTH = 760
export const MAIN_WINDOW_MIN_HEIGHT = 560

export function buildMainWindowOptions(
  preloadPath: string,
  restoredBounds?: Partial<Rectangle>,
): BrowserWindowConstructorOptions {
  return {
    width: restoredBounds?.width ?? 1360,
    height: restoredBounds?.height ?? 860,
    x: restoredBounds?.x,
    y: restoredBounds?.y,
    minWidth: MAIN_WINDOW_MIN_WIDTH,
    minHeight: MAIN_WINDOW_MIN_HEIGHT,
    titleBarStyle: 'hidden',
    trafficLightPosition: { x: 20, y: 18 },
    vibrancy: 'sidebar',
    visualEffectState: 'active',
    backgroundColor: 'transparent',
    resizable: true,
    show: false,
    webPreferences: {
      preload: preloadPath,
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      webSecurity: true,
      allowRunningInsecureContent: false,
    },
  }
}
