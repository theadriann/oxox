import { describe, expect, it } from 'vitest'

import {
  createWindowStateEntry,
  createWindowStateSnapshot,
  DEFAULT_WINDOW_STATE_ID,
  loadWindowState,
  saveWindowState,
} from '../windows/windowState'

describe('windowState', () => {
  it('creates a snapshot for every open window that can be written to disk', () => {
    const result = createWindowStateSnapshot([
      createWindowStateEntry('window-alpha', {
        height: 860,
        width: 1360,
        x: 120,
        y: 80,
      }),
      createWindowStateEntry('window-beta', {
        height: 720,
        width: 1180,
        x: 420,
        y: 160,
      }),
    ])

    expect(result).toEqual({
      windows: [
        {
          id: 'window-alpha',
          bounds: {
            height: 860,
            width: 1360,
            x: 120,
            y: 80,
          },
        },
        {
          id: 'window-beta',
          bounds: {
            height: 720,
            width: 1180,
            x: 420,
            y: 160,
          },
        },
      ],
    })
  })

  it('loads valid persisted window lists from disk', () => {
    const writes = new Map<string, string>()

    saveWindowState(
      '/tmp/window-state.json',
      createWindowStateSnapshot([
        createWindowStateEntry('window-alpha', {
          height: 900,
          width: 1400,
          x: 16,
          y: 24,
        }),
        createWindowStateEntry('window-beta', {
          height: 760,
          width: 1200,
          x: 200,
          y: 140,
        }),
      ]),
      {
        mkdirSync: () => undefined,
        writeFileSync: (filePath, content) => {
          writes.set(filePath, content)
        },
      },
    )

    const result = loadWindowState('/tmp/window-state.json', {
      readFileSync: (filePath) => {
        const content = writes.get(filePath)

        if (!content) {
          throw new Error(`missing ${filePath}`)
        }

        return content
      },
    })

    expect(result).toEqual({
      windows: [
        {
          id: 'window-alpha',
          bounds: {
            height: 900,
            width: 1400,
            x: 16,
            y: 24,
          },
        },
        {
          id: 'window-beta',
          bounds: {
            height: 760,
            width: 1200,
            x: 200,
            y: 140,
          },
        },
      ],
    })
  })

  it('migrates legacy single-window bounds files into a multi-window snapshot', () => {
    const result = loadWindowState('/tmp/window-state.json', {
      readFileSync: () => '{"bounds":{"height":860,"width":1360,"x":120,"y":80}}',
    })

    expect(result).toEqual({
      windows: [
        {
          id: DEFAULT_WINDOW_STATE_ID,
          bounds: {
            height: 860,
            width: 1360,
            x: 120,
            y: 80,
          },
        },
      ],
    })
  })

  it('ignores malformed persisted state files', () => {
    const result = loadWindowState('/tmp/window-state.json', {
      readFileSync: () => '{"windows":[{"id":"window-alpha","bounds":{"width":"nope"}}]}',
    })

    expect(result).toBeUndefined()
  })
})
