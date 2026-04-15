import { createHash } from 'node:crypto'
import { readFileSync, statSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const scriptDirectory = dirname(fileURLToPath(import.meta.url))
const projectRoot = resolve(scriptDirectory, '../..')
const packageJson = JSON.parse(readFileSync(resolve(projectRoot, 'package.json'), 'utf8'))
const version = packageJson.version
const releaseDirectory = resolve(projectRoot, 'release')

if (typeof version !== 'string' || version.length === 0) {
  throw new Error('Unable to resolve package version from package.json')
}

const files = [
  `OXOX-${version}-mac.zip`,
  `OXOX-${version}.dmg`,
  `OXOX-${version}-arm64-mac.zip`,
  `OXOX-${version}-arm64.dmg`,
]

const metadata = files.map((fileName) => {
  const filePath = resolve(releaseDirectory, fileName)
  const contents = readFileSync(filePath)

  return {
    url: fileName,
    sha512: createHash('sha512').update(contents).digest('base64'),
    size: statSync(filePath).size,
  }
})

const primaryFile = metadata[0]

if (!primaryFile) {
  throw new Error('Unable to generate latest-mac.yml without mac artifacts')
}

const yaml = [
  `version: ${version}`,
  'files:',
  ...metadata.flatMap((file) => [
    `  - url: ${file.url}`,
    `    sha512: ${file.sha512}`,
    `    size: ${file.size}`,
  ]),
  `path: ${primaryFile.url}`,
  `sha512: ${primaryFile.sha512}`,
  `releaseDate: '${new Date().toISOString()}'`,
  '',
].join('\n')

writeFileSync(resolve(releaseDirectory, 'latest-mac.yml'), yaml, 'utf8')
