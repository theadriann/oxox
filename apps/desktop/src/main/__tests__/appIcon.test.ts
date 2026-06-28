import { describe, expect, it } from 'vitest'

import {
  APP_ICON_SIZES,
  buildAppIconSvg,
  buildTrayIconSvg,
  resolveTrayIconPath,
  TRAY_ICON_SIZES,
  TRAY_ICON_TEMPLATE_FILE,
  TRAY_ICON_TEMPLATE_RETINA_FILE,
} from '../native/appIcon'

describe('placeholder app icons', () => {
  it('defines a branded dock icon with retina-sized representations', () => {
    expect(APP_ICON_SIZES).toEqual([64, 128, 256, 512])

    const svg = buildAppIconSvg(256)

    expect(svg).toContain('viewBox="0 0 256 256"')
    expect(svg).toContain('linearGradient')
    expect(svg).toContain('#F47A2A')
  })

  it('defines a crisp menu bar tray icon with template-sized representations', () => {
    expect(TRAY_ICON_SIZES).toEqual([16, 18, 32, 36])
    expect(TRAY_ICON_TEMPLATE_FILE).toBe('oxox-trayTemplate.png')
    expect(TRAY_ICON_TEMPLATE_RETINA_FILE).toBe('oxox-trayTemplate@2x.png')
    expect(
      resolveTrayIconPath({
        isPackaged: false,
        projectRoot: '/repo',
        resourcesPath: '/resources',
      }),
    ).toBe('/repo/build/icons/oxox-trayTemplate.png')
    expect(
      resolveTrayIconPath({
        isPackaged: true,
        projectRoot: '/repo',
        resourcesPath: '/resources',
      }),
    ).toBe('/resources/icons/oxox-trayTemplate.png')

    const svg = buildTrayIconSvg(32)

    expect(svg).toContain('viewBox="0 0 32 32"')
    expect(svg).toContain('fill="black"')
    expect(svg).toContain('stroke="black"')
  })
})
