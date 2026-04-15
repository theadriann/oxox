import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const scriptDirectory = dirname(fileURLToPath(import.meta.url))
const projectRoot = resolve(scriptDirectory, '../..')
const packageJson = JSON.parse(readFileSync(resolve(projectRoot, 'package.json'), 'utf8'))
const version = packageJson.version

if (typeof version !== 'string' || version.length === 0) {
  throw new Error('Unable to resolve package version from package.json')
}

const workingTreeStatus = execFileSync('git', ['status', '--porcelain'], {
  cwd: projectRoot,
  encoding: 'utf8',
}).trim()

if (workingTreeStatus.length > 0) {
  throw new Error('Refusing to create a release tag from a dirty working tree.')
}

const tagName = `v${version}`

try {
  execFileSync('git', ['rev-parse', '--verify', `refs/tags/${tagName}`], {
    cwd: projectRoot,
    stdio: 'ignore',
  })
  throw new Error(`Tag ${tagName} already exists.`)
} catch (error) {
  if (!(error instanceof Error) || error.message !== `Tag ${tagName} already exists.`) {
    execFileSync('git', ['tag', '-a', tagName, '-m', tagName], {
      cwd: projectRoot,
      stdio: 'inherit',
    })
  } else {
    throw error
  }
}
