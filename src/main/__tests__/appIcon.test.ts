import { describe, expect, it } from 'vitest'

import {
  APP_ICON_SIZES,
  buildAppIconSvg,
  buildTrayIconSvg,
  TRAY_ICON_SIZES,
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

    const svg = buildTrayIconSvg(32)

    expect(svg).toContain('viewBox="0 0 32 32"')
    expect(svg).toContain('fill="black"')
    expect(svg).toContain('stroke="black"')
  })
})
