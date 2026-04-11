import { observer } from 'mobx-react-lite'
import { useMemo } from 'react'

import { useStores } from '../../stores/StoreProvider'
import { TodoList } from '../transcript/TodoList'
import { extractLatestTodos } from '../transcript/todoParser'

export const TodoListConnected = observer(function TodoListConnected() {
  const { liveSessionStore } = useStores()
  const snapshot = liveSessionStore.selectedSnapshot

  const todos = useMemo(() => {
    if (!snapshot?.events) return null
    return extractLatestTodos(snapshot.events)
  }, [snapshot?.events])

  if (!todos || todos.length === 0) return null

  return <TodoList items={todos} />
})
