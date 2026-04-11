import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'

import type { Rectangle } from 'electron'

export const DEFAULT_WINDOW_STATE_ID = 'window-1'

export interface WindowStateEntry {
  id: string
  bounds: Rectangle
}

export interface WindowStateSnapshot {
  windows: WindowStateEntry[]
}

interface WindowStateReader {
  readFileSync: (filePath: string, encoding: BufferEncoding) => string
}

interface WindowStateWriter {
  mkdirSync: (directoryPath: string, options: { recursive: true }) => void
  writeFileSync: (filePath: string, data: string, encoding: BufferEncoding) => void
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function isRectangle(value: unknown): value is Rectangle {
  if (!value || typeof value !== 'object') {
    return false
  }

  const rectangle = value as Partial<Rectangle>

  return (
    isFiniteNumber(rectangle.x) &&
    isFiniteNumber(rectangle.y) &&
    isFiniteNumber(rectangle.width) &&
    rectangle.width > 0 &&
    isFiniteNumber(rectangle.height) &&
    rectangle.height > 0
  )
}

function isWindowStateEntry(value: unknown): value is WindowStateEntry {
  if (!value || typeof value !== 'object') {
    return false
  }

  const entry = value as Partial<WindowStateEntry>
  return typeof entry.id === 'string' && entry.id.length > 0 && isRectangle(entry.bounds)
}

export function createWindowStateEntry(id: string, bounds: Rectangle): WindowStateEntry {
  return {
    id,
    bounds: normalizeBounds(bounds),
  }
}

export function createWindowStateSnapshot(windows: WindowStateEntry[]): WindowStateSnapshot {
  return {
    windows: windows.map((window) => createWindowStateEntry(window.id, window.bounds)),
  }
}

export function loadWindowState(
  filePath: string,
  reader: WindowStateReader = { readFileSync },
): WindowStateSnapshot | undefined {
  try {
    const payload = JSON.parse(reader.readFileSync(filePath, 'utf8')) as unknown
    return normalizeSnapshot(payload)
  } catch {
    return undefined
  }
}

export function saveWindowState(
  filePath: string,
  snapshot: WindowStateSnapshot,
  writer: WindowStateWriter = { mkdirSync, writeFileSync },
): void {
  writer.mkdirSync(dirname(filePath), { recursive: true })
  writer.writeFileSync(filePath, JSON.stringify(snapshot, null, 2), 'utf8')
}

function normalizeBounds(bounds: Rectangle): Rectangle {
  return {
    height: bounds.height,
    width: bounds.width,
    x: bounds.x,
    y: bounds.y,
  }
}

function normalizeSnapshot(payload: unknown): WindowStateSnapshot | undefined {
  if (!payload || typeof payload !== 'object') {
    return undefined
  }

  const snapshot = payload as Partial<WindowStateSnapshot> & {
    bounds?: Rectangle
  }

  if (Array.isArray(snapshot.windows)) {
    const entries = snapshot.windows.filter(isWindowStateEntry)

    if (entries.length === 0) {
      return undefined
    }

    const dedupedEntries = Array.from(
      new Map(
        entries.map((entry) => [entry.id, createWindowStateEntry(entry.id, entry.bounds)]),
      ).values(),
    )

    return {
      windows: dedupedEntries,
    }
  }

  if (isRectangle(snapshot.bounds)) {
    return {
      windows: [createWindowStateEntry(DEFAULT_WINDOW_STATE_ID, snapshot.bounds)],
    }
  }

  return undefined
}
