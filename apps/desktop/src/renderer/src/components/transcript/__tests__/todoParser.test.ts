import { describe, expect, it } from 'vitest'

import { extractLatestTodos, parseTodoItems } from '../todoParser'

describe('parseTodoItems', () => {
  it('parses a multi-line todo string into structured items', () => {
    const raw =
      '1. [in_progress] Explore current composer\n2. [pending] Implement model selector\n3. [completed] Run tests'
    const items = parseTodoItems(raw)

    expect(items).toEqual([
      { index: 0, status: 'in_progress', text: 'Explore current composer' },
      { index: 1, status: 'pending', text: 'Implement model selector' },
      { index: 2, status: 'completed', text: 'Run tests' },
    ])
  })

  it('returns an empty array for non-matching text', () => {
    expect(parseTodoItems('hello world')).toEqual([])
    expect(parseTodoItems('')).toEqual([])
  })
})

describe('extractLatestTodos', () => {
  it('extracts todos from the latest TodoWrite tool.progress event with JSON detail', () => {
    const events = [
      {
        type: 'tool.progress',
        toolName: 'Read',
        detail: 'Reading file...',
      },
      {
        type: 'tool.progress',
        toolName: 'TodoWrite',
        detail:
          '```json\n{\n  "todos": "1. [in_progress] First task\\n2. [pending] Second task"\n}\n```',
      },
      {
        type: 'tool.result',
        toolName: 'TodoWrite',
      },
    ]

    const todos = extractLatestTodos(events)

    expect(todos).toEqual([
      { index: 0, status: 'in_progress', text: 'First task' },
      { index: 1, status: 'pending', text: 'Second task' },
    ])
  })

  it('extracts todos from raw text detail without JSON wrapper', () => {
    const events = [
      {
        type: 'tool.progress',
        toolName: 'TodoWrite',
        detail: '1. [completed] Done\n2. [in_progress] Working',
      },
    ]

    const todos = extractLatestTodos(events)

    expect(todos).toEqual([
      { index: 0, status: 'completed', text: 'Done' },
      { index: 1, status: 'in_progress', text: 'Working' },
    ])
  })

  it('returns the latest TodoWrite event, not earlier ones', () => {
    const events = [
      {
        type: 'tool.progress',
        toolName: 'TodoWrite',
        detail: '1. [pending] Old task',
      },
      {
        type: 'tool.progress',
        toolName: 'TodoWrite',
        detail: '1. [completed] Old task\n2. [in_progress] New task',
      },
    ]

    const todos = extractLatestTodos(events)

    expect(todos).toHaveLength(2)
    expect(todos?.[0].status).toBe('completed')
    expect(todos?.[1].status).toBe('in_progress')
  })

  it('returns null when no TodoWrite events exist', () => {
    expect(extractLatestTodos([])).toBeNull()
    expect(
      extractLatestTodos([{ type: 'tool.progress', toolName: 'Read', detail: 'reading' }]),
    ).toBeNull()
  })
})
