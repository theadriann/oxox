import { CheckCircle2, Circle, Loader2 } from 'lucide-react'
import { memo, useMemo } from 'react'

import { type TodoItem, type TodoStatus, parseTodoItems } from './todoParser'

interface TodoWriteViewProps {
  inputMarkdown: string | null
}

const statusIcon: Record<TodoStatus, React.ReactNode> = {
  completed: <CheckCircle2 className="size-3.5 text-fd-ready" />,
  in_progress: <Loader2 className="size-3.5 animate-spin text-fd-warning" />,
  pending: <Circle className="size-3.5 text-fd-tertiary" />,
}

export const TodoWriteView = memo(function TodoWriteView({ inputMarkdown }: TodoWriteViewProps) {
  const items = useMemo(() => extractTodos(inputMarkdown), [inputMarkdown])

  if (items.length === 0) return null

  return (
    <div className="flex flex-col py-1">
      {items.map((item) => (
        <div
          key={item.index}
          className="flex items-start gap-2 px-3 py-1"
        >
          <span className="mt-px shrink-0">{statusIcon[item.status]}</span>
          <span
            className={`text-[12px] leading-snug ${
              item.status === 'completed'
                ? 'text-fd-tertiary line-through decoration-fd-tertiary/40'
                : item.status === 'in_progress'
                  ? 'text-fd-primary'
                  : 'text-fd-secondary'
            }`}
          >
            {item.text}
          </span>
        </div>
      ))}
    </div>
  )
})

function extractTodos(inputMarkdown: string | null): TodoItem[] {
  if (!inputMarkdown) return []

  const trimmed = inputMarkdown.trim()
  const fencedMatch = trimmed.match(/^```(?:json)?\n([\s\S]*?)\n```$/)
  const jsonText = fencedMatch ? fencedMatch[1] : trimmed

  try {
    const parsed = JSON.parse(jsonText) as Record<string, unknown>
    if (typeof parsed.todos === 'string') {
      return parseTodoItems(parsed.todos)
    }
  } catch {
    // Fall through to raw parse
  }

  return parseTodoItems(inputMarkdown)
}
