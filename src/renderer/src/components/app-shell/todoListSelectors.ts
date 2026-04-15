import type { LiveSessionSnapshot } from '../../../../shared/ipc/contracts'
import { extractLatestTodos } from '../transcript/todoParser'

export function selectTodoListItems(snapshot: Pick<LiveSessionSnapshot, 'events'> | null) {
  if (!snapshot?.events || snapshot.events.length === 0) {
    return null
  }

  return extractLatestTodos(snapshot.events)
}
