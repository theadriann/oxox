import { existsSync, readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

type PackageJson = {
  dependencies?: Record<string, string | undefined>
  scripts?: Record<string, string | undefined>
  devDependencies?: Record<string, string | undefined>
  build?: {
    appId?: string
    electronUpdaterCompatibility?: string
    productName?: string
    directories?: {
      buildResources?: string
      output?: string
    }
    files?: string[]
    asarUnpack?: string[]
    publish?: Array<{
      provider?: string
      owner?: string
      repo?: string
      releaseType?: string
    }>
    mac?: {
      category?: string
      entitlements?: string
      entitlementsInherit?: string
      gatekeeperAssess?: boolean
      hardenedRuntime?: boolean
      icon?: string
      notarize?: boolean
      target?: string[]
    }
  }
}

const currentDirectory = dirname(fileURLToPath(import.meta.url))
const projectRoot = resolve(currentDirectory, '../../../')
const packageJsonPath = resolve(projectRoot, 'package.json')
const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf8')) as PackageJson

describe('packaging configuration', () => {
  it('defines electron-builder scripts for mac packaging', () => {
    expect(packageJson.devDependencies?.['electron-builder']).toBeDefined()
    expect(packageJson.dependencies?.['electron-updater']).toBeDefined()
    expect(packageJson.dependencies?.uuid).toBeDefined()
    expect(packageJson.scripts?.package).toBe('pnpm run build && electron-builder --mac --dir')
    expect(packageJson.scripts?.dist).toBe('pnpm run dist:mac')
    expect(packageJson.scripts?.['dist:mac']).toBe(
      'pnpm run build && electron-builder --mac --universal',
    )
    expect(packageJson.scripts?.['dist:mac:x64']).toBe(
      'pnpm run build && electron-builder --mac --x64',
    )
    expect(packageJson.scripts?.['dist:mac:arm64']).toBe(
      'pnpm run build && electron-builder --mac --arm64',
    )
    expect(packageJson.scripts?.['dist:mac:all']).toBe(
      'pnpm run build && electron-builder --mac --x64 && electron-builder --mac --arm64',
    )
    expect(packageJson.scripts?.['release:validate']).toBe(
      'pnpm lint && pnpm typecheck && pnpm test',
    )
    expect(packageJson.scripts?.['release:metadata:mac']).toBe(
      'node scripts/release/update-mac-release-metadata.mjs',
    )
    expect(packageJson.scripts?.['release:artifacts']).toBe(
      './package-mac-signed.sh dist:mac:all && pnpm run release:metadata:mac',
    )
    expect(packageJson.scripts?.['release:tag']).toBe('node scripts/release/create-version-tag.mjs')
    expect(packageJson.scripts?.['release:github']).toBe(
      'node scripts/release/create-github-release.mjs',
    )
    expect(packageJson.scripts?.package).not.toContain('--publish')
    expect(packageJson.scripts?.dist).not.toContain('--publish')
    expect(packageJson.scripts?.['dist:mac:all']).not.toContain('--publish')
  })

  it('uses committed build resources, GitHub publish metadata, and hardened-runtime notarization settings', () => {
    expect(packageJson.build).toMatchObject({
      appId: 'com.theadriann.oxox',
      electronUpdaterCompatibility: '>=2.16',
      productName: 'OXOX',
      directories: {
        buildResources: 'build',
        output: 'release',
      },
      files: ['out/**', 'node_modules/**', 'package.json'],
      asarUnpack: ['node_modules/better-sqlite3/**/*'],
      publish: [
        {
          provider: 'github',
          owner: 'theadriann',
          repo: 'oxox',
          releaseType: 'release',
        },
      ],
      mac: {
        category: 'public.app-category.developer-tools',
        entitlements: 'build/entitlements.mac.plist',
        entitlementsInherit: 'build/entitlements.mac.plist',
        gatekeeperAssess: false,
        hardenedRuntime: true,
        icon: 'build/icons/icon.icns',
        notarize: true,
      },
    })

    expect(existsSync(resolve(projectRoot, 'build/entitlements.mac.plist'))).toBe(true)
    expect(existsSync(resolve(projectRoot, 'build/icons/icon.icns'))).toBe(true)
    expect(existsSync(resolve(projectRoot, 'build/icons/oxox.png'))).toBe(true)
    expect(existsSync(resolve(projectRoot, 'build/icons/icon.png'))).toBe(false)
    expect(existsSync(resolve(projectRoot, 'build/icons/appstore.png'))).toBe(false)
    expect(existsSync(resolve(projectRoot, 'build/icons/playstore.png'))).toBe(false)
  })
})
