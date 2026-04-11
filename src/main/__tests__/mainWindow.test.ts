import { describe, expect, it } from 'vitest'

import { buildMainWindowOptions } from '../windows/mainWindow'

describe('buildMainWindowOptions', () => {
  it('creates a secure frameless macOS window shell', () => {
    const options = buildMainWindowOptions('/tmp/preload.js')

    expect(options.titleBarStyle).toBe('hidden')
    expect(options.vibrancy).toBe('sidebar')
    expect(options.visualEffectState).toBe('active')
    expect(options.trafficLightPosition).toEqual({ x: 20, y: 18 })
    expect(options.minWidth).toBeGreaterThanOrEqual(720)
    expect(options.minHeight).toBeGreaterThanOrEqual(540)
    expect(options.backgroundColor).toBe('transparent')
    expect(options.webPreferences).toMatchObject({
      preload: '/tmp/preload.js',
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      webSecurity: true,
    })
    expect(options.webPreferences?.allowRunningInsecureContent).toBe(false)
  })

  it('restores persisted bounds when previous window state exists', () => {
    const options = buildMainWindowOptions('/tmp/preload.js', {
      height: 900,
      width: 1440,
      x: 40,
      y: 28,
    })

    expect(options.width).toBe(1440)
    expect(options.height).toBe(900)
    expect(options.x).toBe(40)
    expect(options.y).toBe(28)
  })
})
