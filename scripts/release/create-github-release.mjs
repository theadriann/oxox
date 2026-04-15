import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const scriptDirectory = dirname(fileURLToPath(import.meta.url))
const projectRoot = resolve(scriptDirectory, '../..')
const releaseDirectory = resolve(projectRoot, 'release')
const packageJson = JSON.parse(readFileSync(resolve(projectRoot, 'package.json'), 'utf8'))
const version = packageJson.version

if (typeof version !== 'string' || version.length === 0) {
  throw new Error('Unable to resolve package version from package.json')
}

const tagName = `v${version}`
const assets = [
  `OXOX-${version}.dmg`,
  `OXOX-${version}.dmg.blockmap`,
  `OXOX-${version}-mac.zip`,
  `OXOX-${version}-mac.zip.blockmap`,
  `OXOX-${version}-arm64.dmg`,
  `OXOX-${version}-arm64.dmg.blockmap`,
  `OXOX-${version}-arm64-mac.zip`,
  `OXOX-${version}-arm64-mac.zip.blockmap`,
  'latest-mac.yml',
]

for (const asset of assets) {
  const assetPath = resolve(releaseDirectory, asset)
  if (!existsSync(assetPath)) {
    throw new Error(`Missing release asset: ${asset}`)
  }
}

execFileSync(
  'gh',
  [
    'release',
    'create',
    tagName,
    ...assets.map((asset) => resolve(releaseDirectory, asset)),
    '--repo',
    'theadriann/oxox',
    '--title',
    tagName,
    '--generate-notes',
    '--verify-tag',
    '--latest',
  ],
  {
    cwd: projectRoot,
    stdio: 'inherit',
  },
)
