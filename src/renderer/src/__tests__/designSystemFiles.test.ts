import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const rendererRoot = resolve(__dirname, '../../')
const stylesPath = resolve(rendererRoot, 'src/styles.css')
const htmlPath = resolve(rendererRoot, 'index.html')

describe('design system configuration files', () => {
  it('defines Factory Core Dark Tailwind theme tokens and local font faces', () => {
    const styles = readFileSync(stylesPath, 'utf8')

    expect(styles).toContain('@import "tailwindcss";')
    expect(styles).toContain('@theme inline')
    expect(styles).toContain('--fd-canvas: #1a1a1a;')
    expect(styles).toContain('--fd-surface: #1e1e1e;')
    expect(styles).toContain('--fd-panel: #232323;')
    expect(styles).toContain('--fd-text-primary: #e6e6e6;')
    expect(styles).toContain('--fd-text-secondary: #999999;')
    expect(styles).toContain('--fd-ember-500: #e06b1f;')
    expect(styles).toContain('--fd-motion-fast: 80ms;')
    expect(styles).toContain('--fd-motion-base: 140ms;')
    expect(styles).toContain('--fd-motion-emphasis: 260ms;')
    expect(styles).toContain('--fd-ease-default: cubic-bezier(0.16, 1, 0.3, 1);')
    expect(styles).toContain('--color-fd-canvas: var(--fd-canvas);')
    expect(styles).toContain('--color-fd-surface: var(--fd-surface);')
    expect(styles).toContain('--color-fd-panel: var(--fd-panel);')
    expect(styles).toContain(
      '--font-display: "Geist", "Inter", ui-sans-serif, system-ui, sans-serif;',
    )
    expect(styles).toContain('--font-body: "Inter", ui-sans-serif, system-ui, sans-serif;')
    expect(styles).toContain('--font-mono: "SF Mono", "SFMono-Regular", ui-monospace, monospace;')
    expect(styles).toContain('font-display: block;')
    expect(styles).toContain('@media (prefers-reduced-motion: reduce)')
    expect(styles).toContain('animation: none;')
  })

  it('preloads locally bundled fonts without external requests', () => {
    const html = readFileSync(htmlPath, 'utf8')

    expect(html).toContain('rel="preload"')
    expect(html).toContain('href="/fonts/geist-latin-500-normal.woff2"')
    expect(html).toContain('href="/fonts/inter-latin-400-normal.woff2"')
    expect(html).toContain('href="/fonts/SF-Mono-Regular.otf"')
    expect(html).not.toMatch(/https?:\/\/.*(font|fonts|googleapis|gstatic)/i)
  })
})
