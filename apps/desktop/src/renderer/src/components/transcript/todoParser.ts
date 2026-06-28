export type TodoStatus = 'pending' | 'in_progress' | 'completed'

export interface TodoItem {
  index: number
  status: TodoStatus
  text: string
}

const STATUS_PATTERN = /^\d+\.\s*\[(completed|in_progress|pending)]\s*/

export function parseTodoItems(raw: string): TodoItem[] {
  const items: TodoItem[] = []

  for (const line of raw.split('\n')) {
    const trimmed = line.trim()
    const match = STATUS_PATTERN.exec(trimmed)
    if (!match) continue

    items.push({
      index: items.length,
      status: match[1] as TodoStatus,
      text: trimmed.slice(match[0].length),
    })
  }

  return items
}

export function extractLatestTodos(
  events: ReadonlyArray<{ type: string; toolName?: string; detail?: string }>,
): TodoItem[] | null {
  for (let i = events.length - 1; i >= 0; i--) {
    const event = events[i]
    if (event.type !== 'tool.progress' || event.toolName !== 'TodoWrite') continue
    if (typeof event.detail !== 'string') continue

    const todoText = extractTodoText(event.detail)
    if (!todoText) continue

    const items = parseTodoItems(todoText)
    if (items.length > 0) return items
  }

  return null
}

function extractTodoText(detail: string): string | null {
  const stripped = stripMarkdownFences(detail)

  // Try parsing as JSON: { "todos": "1. [in_progress] ..." }
  try {
    const parsed = JSON.parse(stripped) as Record<string, unknown>
    if (typeof parsed.todos === 'string') return parsed.todos
  } catch {
    // not JSON, try raw text
  }

  // Raw text: lines with [status] markers
  if (STATUS_PATTERN.test(stripped)) return stripped

  return null
}

function stripMarkdownFences(text: string): string {
  const fenceMatch = /^```(?:\w+)?\n([\s\S]*?)```\s*$/m.exec(text)
  return fenceMatch ? fenceMatch[1].trim() : text.trim()
}
