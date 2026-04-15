import { describe, expect, it } from 'vitest'

import { selectTodoListItems } from '../todoListSelectors'

describe('selectTodoListItems', () => {
  it('returns null when there is no selected snapshot or no events', () => {
    expect(selectTodoListItems(null)).toBeNull()
    expect(
      selectTodoListItems({
        events: [],
      }),
    ).toBeNull()
  })

  it('extracts the latest todo list items from snapshot events', () => {
    const todos = selectTodoListItems({
      events: [
        {
          type: 'tool.progress',
          toolName: 'TodoWrite',
          detail: '1. [completed] Done\n2. [in_progress] Next',
        },
      ],
    })

    expect(todos).toEqual([
      { index: 0, status: 'completed', text: 'Done' },
      { index: 1, status: 'in_progress', text: 'Next' },
    ])
  })
})
