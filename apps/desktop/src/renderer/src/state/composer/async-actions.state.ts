import { type Observable, observable } from '@legendapp/state'

export type AsyncActionStatus = 'running' | 'success' | 'error'

export interface AsyncActionItem {
  id: string
  title: string
  description: string | null
  status: AsyncActionStatus
  updatedAt: number
}

export interface AsyncActionsState {
  actions: AsyncActionItem[]
}

export function createDefaultAsyncActionsState(): AsyncActionsState {
  return {
    actions: [],
  }
}

export function createAsyncActionsState$(): Observable<AsyncActionsState> {
  return observable(createDefaultAsyncActionsState())
}
