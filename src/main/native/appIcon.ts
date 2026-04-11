import { Buffer } from 'node:buffer'
import { nativeImage } from 'electron'
import { FACTORY_CORE_DARK } from '../../shared/designTokens'

export const APP_ICON_SIZES = [64, 128, 256, 512] as const
export const TRAY_ICON_SIZES = [16, 18, 32, 36] as const

export function buildAppIconSvg(size: number): string {
  const strokeWidth = Math.max(6, Math.round(size * 0.035))
  const inset = Math.round(size * 0.125)
  const innerInset = Math.round(size * 0.28)
  const radius = Math.round(size * 0.24)
  const center = size / 2

  const { background, brand } = FACTORY_CORE_DARK

  return `
    <svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" fill="none">
      <defs>
        <linearGradient id="oxox-app-gradient" x1="${inset}" y1="${inset}" x2="${size - inset}" y2="${size - inset}" gradientUnits="userSpaceOnUse">
          <stop offset="0" stop-color="${brand.ember400}" />
          <stop offset="0.55" stop-color="${brand.ember500}" />
          <stop offset="1" stop-color="${brand.ember600}" />
        </linearGradient>
      </defs>
      <rect x="${inset}" y="${inset}" width="${size - inset * 2}" height="${size - inset * 2}" rx="${radius}" fill="${background.surface}" stroke="url(#oxox-app-gradient)" stroke-width="${strokeWidth}" />
      <circle cx="${center}" cy="${center}" r="${Math.round(size * 0.2)}" fill="${background.canvas}" stroke="url(#oxox-app-gradient)" stroke-width="${strokeWidth}" />
      <path d="M${innerInset} ${innerInset}L${size - innerInset} ${size - innerInset}" stroke="${brand.ember500}" stroke-linecap="round" stroke-width="${strokeWidth}" />
      <path d="M${size - innerInset} ${innerInset}L${innerInset} ${size - innerInset}" stroke="${brand.gold400}" stroke-linecap="round" stroke-width="${Math.max(4, Math.round(size * 0.025))}" />
    </svg>
  `.trim()
}

export function buildTrayIconSvg(size: number): string {
  const strokeWidth = Math.max(1.5, Number((size * 0.1).toFixed(2)))
  const inset = Math.round(size * 0.16)
  const radius = Math.round(size * 0.22)
  const center = size / 2
  const orbitRadius = Number((size * 0.18).toFixed(2))

  return `
    <svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" fill="none">
      <rect x="${inset}" y="${inset}" width="${size - inset * 2}" height="${size - inset * 2}" rx="${radius}" fill="black" opacity="0.12" />
      <circle cx="${center}" cy="${center}" r="${orbitRadius}" fill="none" stroke="black" stroke-width="${strokeWidth}" />
      <path d="M${inset + strokeWidth} ${inset + strokeWidth}L${size - inset - strokeWidth} ${size - inset - strokeWidth}" stroke="black" stroke-linecap="round" stroke-width="${strokeWidth}" />
      <path d="M${size - inset - strokeWidth} ${inset + strokeWidth}L${inset + strokeWidth} ${size - inset - strokeWidth}" stroke="black" stroke-linecap="round" stroke-width="${strokeWidth}" />
    </svg>
  `.trim()
}

export function createAppIcon() {
  return createImage(buildAppIconSvg(APP_ICON_SIZES.at(-1) ?? 512))
}

export function createTrayIcon() {
  const image = createImage(buildTrayIconSvg(TRAY_ICON_SIZES.at(-1) ?? 36))
  image.setTemplateImage(true)

  return image
}

function createImage(svgMarkup: string) {
  return nativeImage.createFromDataURL(
    `data:image/svg+xml;base64,${Buffer.from(svgMarkup).toString('base64')}`,
  )
}
