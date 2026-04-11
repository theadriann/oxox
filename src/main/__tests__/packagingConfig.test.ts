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
    productName?: string
    directories?: {
      buildResources?: string
      output?: string
    }
    files?: string[]
    asarUnpack?: string[]
    mac?: {
      category?: string
      icon?: string
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
    expect(packageJson.dependencies?.uuid).toBeDefined()
    expect(packageJson.scripts?.package).toBe('pnpm run build && electron-builder --mac --dir')
    expect(packageJson.scripts?.dist).toBe('pnpm run build && electron-builder --mac')
  })

  it('uses committed build resources for packaged app icons', () => {
    expect(packageJson.build).toMatchObject({
      appId: 'com.theadriann.oxox',
      productName: 'OXOX',
      directories: {
        buildResources: 'build',
        output: 'release',
      },
      files: ['out/**', 'node_modules/**', 'package.json'],
      asarUnpack: ['node_modules/better-sqlite3/**/*'],
      mac: {
        category: 'public.app-category.developer-tools',
        icon: 'build/icons/icon.icns',
      },
    })

    expect(existsSync(resolve(projectRoot, 'build/icons/icon.icns'))).toBe(true)
    expect(existsSync(resolve(projectRoot, 'build/icons/oxox.png'))).toBe(true)
    expect(existsSync(resolve(projectRoot, 'build/icons/icon.png'))).toBe(false)
    expect(existsSync(resolve(projectRoot, 'build/icons/appstore.png'))).toBe(false)
    expect(existsSync(resolve(projectRoot, 'build/icons/playstore.png'))).toBe(false)
  })
})
