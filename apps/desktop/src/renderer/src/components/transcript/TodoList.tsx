import { CheckCircle2, ChevronDown, Circle, Loader2 } from 'lucide-react'
import { memo, useState } from 'react'

import type { TodoItem, TodoStatus } from './todoParser'

interface TodoListProps {
  items: TodoItem[]
}

export const TodoList = memo(function TodoList({ items }: TodoListProps) {
  const [collapsed, setCollapsed] = useState(true)

  if (items.length === 0) return null

  const completedCount = items.filter((item) => item.status === 'completed').length
  const progress = items.length > 0 ? completedCount / items.length : 0

  return (
    <div className="border-b border-fd-border-subtle px-3 py-2">
      <button
        type="button"
        aria-label={collapsed ? 'Expand todo list' : 'Collapse todo list'}
        aria-expanded={!collapsed}
        className="flex w-full cursor-pointer items-center justify-between gap-2"
        onClick={() => setCollapsed((prev) => !prev)}
      >
        <div className="h-1 flex-1 overflow-hidden rounded-full bg-fd-border-subtle">
          <div
            className="h-full rounded-full bg-fd-ember-400 transition-[width] duration-300 ease-out"
            style={{ width: `${progress * 100}%` }}
          />
        </div>
        <span className="shrink-0 text-[10px] tabular-nums text-fd-tertiary">
          {completedCount}/{items.length}
        </span>
        <ChevronDown
          className={`size-3 shrink-0 text-fd-tertiary transition-transform duration-200 ease-out ${collapsed ? '' : 'rotate-180'}`}
        />
      </button>

      <div
        className={`grid transition-[grid-template-rows] duration-200 ease-out ${collapsed ? 'grid-rows-[0fr]' : 'grid-rows-[1fr]'}`}
      >
        <div className="overflow-hidden">
          <ul className="flex max-h-[120px] flex-col gap-1 overflow-y-auto pt-2">
            {items.map((item) => (
              <TodoRow key={item.index} item={item} />
            ))}
          </ul>
        </div>
      </div>
    </div>
  )
})

const TodoRow = memo(function TodoRow({ item }: { item: TodoItem }) {
  return (
    <li className="flex items-start gap-2 py-0.5">
      <StatusIcon status={item.status} />
      <span
        className={`text-[12px] leading-[18px] ${
          item.status === 'completed'
            ? 'text-fd-tertiary line-through decoration-fd-tertiary/40'
            : item.status === 'in_progress'
              ? 'text-fd-primary'
              : 'text-fd-secondary'
        }`}
      >
        {item.text}
      </span>
    </li>
  )
})

function StatusIcon({ status }: { status: TodoStatus }) {
  switch (status) {
    case 'completed':
      return <CheckCircle2 className="mt-px size-3.5 shrink-0 text-fd-ember-400" />
    case 'in_progress':
      return <Loader2 className="mt-px size-3.5 shrink-0 animate-spin text-fd-ember-400" />
    case 'pending':
      return <Circle className="mt-px size-3.5 shrink-0 text-fd-tertiary" />
  }
}
