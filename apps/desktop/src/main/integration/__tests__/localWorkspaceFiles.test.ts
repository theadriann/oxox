import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import {
  getLocalWorkspaceFileContent,
  listLocalWorkspaceFiles,
  searchLocalWorkspaceFiles,
} from '../workspaceFiles/localWorkspaceFiles'

const cleanupPaths: string[] = []

describe('localWorkspaceFiles', () => {
  afterEach(() => {
    while (cleanupPaths.length > 0) {
      const path = cleanupPaths.pop()
      if (path) {
        rmSync(path, { force: true, recursive: true })
      }
    }
  })

  it('lists and searches visible workspace files and directories', async () => {
    const workspacePath = createWorkspace()

    expect(await listLocalWorkspaceFiles({ workspacePath, showHidden: false })).toEqual({
      files: ['src', 'README.md', 'src/App.tsx', 'src/main.ts'],
    })

    expect(
      await searchLocalWorkspaceFiles({
        workspacePath,
        query: 'app',
        maxResults: 8,
        showHidden: false,
      }),
    ).toEqual({
      files: ['src/App.tsx'],
      totalFiles: 4,
    })
    expect(
      await searchLocalWorkspaceFiles({
        workspacePath,
        query: 'src',
        maxResults: 8,
        showHidden: false,
      }),
    ).toEqual({
      files: ['src', 'src/App.tsx', 'src/main.ts'],
      totalFiles: 4,
    })
  })

  it('does not let generated output directories starve source file matches', async () => {
    const workspacePath = createWorkspace()
    mkdirSync(join(workspacePath, 'out', 'assets'), { recursive: true })
    mkdirSync(join(workspacePath, 'release'), { recursive: true })
    mkdirSync(join(workspacePath, 'src', 'main', 'integration'), { recursive: true })

    for (let index = 0; index < 2050; index += 1) {
      writeFileSync(join(workspacePath, 'out', 'assets', `asset-${index}.js`), '')
    }

    writeFileSync(
      join(workspacePath, 'src', 'main', 'integration', 'foundationService.ts'),
      'export function createFoundationService() {}\n',
    )

    await expect(
      searchLocalWorkspaceFiles({
        workspacePath,
        query: 'src',
        maxResults: 8,
        showHidden: false,
      }),
    ).resolves.toMatchObject({
      files: expect.arrayContaining(['src']),
    })

    await expect(
      searchLocalWorkspaceFiles({
        workspacePath,
        query: 'service',
        maxResults: 8,
        showHidden: false,
      }),
    ).resolves.toMatchObject({
      files: expect.arrayContaining(['src/main/integration/foundationService.ts']),
    })
  }, 15_000)

  it('sorts search results by relevance with folders first and alphabetical ties', async () => {
    const workspacePath = createWorkspace()
    mkdirSync(join(workspacePath, 'service'), { recursive: true })
    mkdirSync(join(workspacePath, 'src', 'components'), { recursive: true })
    mkdirSync(join(workspacePath, 'src', 'service'), { recursive: true })
    mkdirSync(join(workspacePath, 'src', 'state'), { recursive: true })
    writeFileSync(join(workspacePath, 'service.ts'), 'export {}\n')
    writeFileSync(join(workspacePath, 'src', 'foundationService.ts'), 'export {}\n')

    await expect(
      searchLocalWorkspaceFiles({
        workspacePath,
        query: 'src',
        maxResults: 6,
        showHidden: false,
      }),
    ).resolves.toMatchObject({
      files: [
        'src',
        'src/components',
        'src/service',
        'src/state',
        'src/App.tsx',
        'src/foundationService.ts',
      ],
    })

    await expect(
      searchLocalWorkspaceFiles({
        workspacePath,
        query: 'service',
        maxResults: 4,
        showHidden: false,
      }),
    ).resolves.toMatchObject({
      files: ['service', 'src/service', 'service.ts', 'src/foundationService.ts'],
    })
  })

  it('sorts browse results by shallow workspace entries before nested children', async () => {
    const workspacePath = createWorkspace()
    mkdirSync(join(workspacePath, 'docs', 'reference'), { recursive: true })
    writeFileSync(join(workspacePath, 'package.json'), '{}\n')
    writeFileSync(join(workspacePath, 'docs', 'reference', 'api.md'), '# API\n')

    await expect(listLocalWorkspaceFiles({ workspacePath, showHidden: false })).resolves.toEqual({
      files: [
        'docs',
        'src',
        'package.json',
        'README.md',
        'docs/reference',
        'src/App.tsx',
        'src/main.ts',
        'docs/reference/api.md',
      ],
    })
  })

  it('sorts path-prefix searches by direct children before deeper matches', async () => {
    const workspacePath = createWorkspace()
    mkdirSync(join(workspacePath, 'src', 'components', 'nested'), { recursive: true })
    mkdirSync(join(workspacePath, 'src', 'state'), { recursive: true })
    writeFileSync(join(workspacePath, 'src', 'components', 'Button.tsx'), 'export {}\n')
    writeFileSync(
      join(workspacePath, 'src', 'components', 'nested', 'ButtonIcon.tsx'),
      'export {}\n',
    )
    writeFileSync(join(workspacePath, 'src', 'index.ts'), 'export {}\n')

    await expect(
      searchLocalWorkspaceFiles({
        workspacePath,
        query: 'src/',
        maxResults: 8,
        showHidden: false,
      }),
    ).resolves.toMatchObject({
      files: [
        'src/components',
        'src/state',
        'src/App.tsx',
        'src/index.ts',
        'src/main.ts',
        'src/components/nested',
        'src/components/Button.tsx',
        'src/components/nested/ButtonIcon.tsx',
      ],
    })
  })

  it('reads workspace file content without allowing paths outside the workspace', async () => {
    const workspacePath = createWorkspace()

    await expect(
      getLocalWorkspaceFileContent({
        workspacePath,
        filePath: '../outside.txt',
        encoding: 'utf8',
      }),
    ).rejects.toThrow(/outside the workspace/i)

    await expect(
      getLocalWorkspaceFileContent({
        workspacePath,
        filePath: 'src/App.tsx',
        encoding: 'utf8',
      }),
    ).resolves.toMatchObject({
      content: 'export function App() {}\n',
      encoding: 'utf8',
      isBinary: false,
      mimeType: 'text/typescript-jsx',
    })
  })
})

function createWorkspace(): string {
  const workspacePath = mkdtempSync(join(tmpdir(), 'oxox-workspace-files-'))
  cleanupPaths.push(workspacePath)
  mkdirSync(join(workspacePath, 'src'), { recursive: true })
  mkdirSync(join(workspacePath, '.git'), { recursive: true })
  writeFileSync(join(workspacePath, 'src', 'App.tsx'), 'export function App() {}\n')
  writeFileSync(join(workspacePath, 'src', 'main.ts'), 'import "./App"\n')
  writeFileSync(join(workspacePath, 'README.md'), '# Example\n')
  writeFileSync(join(workspacePath, '.git', 'config'), '[core]\n')
  writeFileSync(join(workspacePath, '.secret'), 'hidden\n')
  return workspacePath
}
