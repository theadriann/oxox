import { observer } from 'mobx-react-lite'

import { useLiveSessionStore } from '../../stores/StoreProvider'
import { TodoList } from '../transcript/TodoList'
import { selectTodoListItems } from './todoListSelectors'

export const TodoListConnected = observer(function TodoListConnected() {
  const liveSessionStore = useLiveSessionStore()
  const todos = selectTodoListItems(liveSessionStore.selectedSnapshot)

  if (!todos || todos.length === 0) return null

  return <TodoList items={todos} />
})
