import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const rendererRoot = resolve(__dirname, '../../')
const stylesPath = resolve(rendererRoot, 'src/styles.css')
const globalStylesPath = resolve(rendererRoot, 'src/styles/global.css')
const htmlPath = resolve(rendererRoot, 'index.html')
const webStylesPath = resolve(rendererRoot, '../../../web/src/styles.css')
const webMainPath = resolve(rendererRoot, '../../../web/src/main.tsx')

describe('design system configuration files', () => {
  it('defines the OXOX global design tokens and bridges legacy Factory tokens', () => {
    const styles = readFileSync(stylesPath, 'utf8')
    const globalStyles = readFileSync(globalStylesPath, 'utf8')

    expect(styles).toContain('@import "tailwindcss" source(".");')
    expect(styles).toContain('@source "../../../../web/src";')
    expect(styles).toContain('@import "./styles/global.css";')
    expect(styles).toContain('@theme inline')
    expect(globalStyles).toMatch(/--ox-canvas:\s*#[0-9a-f]{6};/i)
    expect(globalStyles).toMatch(/--ox-surface:\s*#[0-9a-f]{6};/i)
    expect(globalStyles).toMatch(/--ox-panel:\s*#[0-9a-f]{6};/i)
    expect(globalStyles).toMatch(/--ox-accent:\s*#[0-9a-f]{6};/i)
    expect(globalStyles).toContain('--fd-canvas: var(--ox-canvas);')
    expect(globalStyles).toContain('--fd-surface: var(--ox-surface);')
    expect(globalStyles).toContain('--fd-panel: var(--ox-panel);')
    expect(globalStyles).toContain('--fd-ember-500: var(--ox-accent);')
    expect(styles).toContain('--color-fd-canvas: var(--fd-canvas);')
    expect(styles).toContain('--color-fd-surface: var(--fd-surface);')
    expect(styles).toContain('--color-fd-panel: var(--fd-panel);')
    expect(globalStyles).toContain('--color-ox-canvas: var(--ox-canvas);')
    expect(styles).toContain('--font-display: var(--font-sans);')
    expect(styles).toContain('--font-body: var(--font-sans);')
    expect(styles).toContain('--font-mono: "SF Mono", "SFMono-Regular", ui-monospace, monospace;')
    expect(styles).toContain('font-display: block;')
    expect(styles).toContain('@media (prefers-reduced-motion: reduce)')
    expect(styles).toContain('animation: none;')
  })

  it('preloads locally bundled DM Sans and mono fonts without external requests', () => {
    const html = readFileSync(htmlPath, 'utf8')

    expect(html).toContain('rel="preload"')
    expect(html).toContain('href="/fonts/DMSans-VariableFont_opsz,wght.ttf"')
    expect(html).toContain('href="/fonts/SF-Mono-Regular.otf"')
    expect(html).not.toMatch(/https?:\/\/.*(font|fonts|googleapis|gstatic)/i)
  })

  it('loads the shared renderer CSS through a web-local Tailwind source wrapper', () => {
    const webMain = readFileSync(webMainPath, 'utf8')
    const webStyles = readFileSync(webStylesPath, 'utf8')

    expect(webMain).toContain("import './styles.css'")
    expect(webStyles).toContain('@import "../../desktop/src/renderer/src/styles.css";')
    expect(webStyles).toContain('@source "../../desktop/src/renderer/src";')
    expect(webStyles).toContain('@source ".";')
  })
})
