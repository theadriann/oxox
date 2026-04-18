import { useValue } from '../../stores/legend'
import { useLiveSessionStore } from '../../stores/StoreProvider'
import { TodoList } from '../transcript/TodoList'
import { selectTodoListItems } from './todoListSelectors'

export function TodoListConnected() {
  const liveSessionStore = useLiveSessionStore()
  const todos = useValue(() => selectTodoListItems(liveSessionStore.selectedSnapshot))

  if (!todos || todos.length === 0) return null

  return <TodoList items={todos} />
}
