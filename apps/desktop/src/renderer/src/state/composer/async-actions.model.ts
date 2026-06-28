import type { Observable } from '@legendapp/state'
import {
  type AsyncActionItem,
  type AsyncActionsState,
  createAsyncActionsState$,
} from './async-actions.state'

export type { AsyncActionItem, AsyncActionStatus } from './async-actions.state'

export class AsyncActionsStore {
  readonly state$: Observable<AsyncActionsState> = createAsyncActionsState$()

  private nextActionId = 0
  private completionTimers = new Map<string, ReturnType<typeof setTimeout>>()

  get actions(): AsyncActionItem[] {
    return this.state$.actions.get()
  }

  startAction(title: string, description: string | null = null): string {
    const id = `async-action-${++this.nextActionId}`
    this.state$.actions.set([
      ...this.actions,
      {
        id,
        title,
        description,
        status: 'running',
        updatedAt: Date.now(),
      },
    ])

    return id
  }

  completeAction(id: string, title?: string, description?: string | null): void {
    this.updateAction(id, {
      title,
      description,
      status: 'success',
      updatedAt: Date.now(),
    })
    this.scheduleDismiss(id)
  }

  failAction(id: string, title?: string, description?: string | null): void {
    this.updateAction(id, {
      title,
      description,
      status: 'error',
      updatedAt: Date.now(),
    })
  }

  dismissAction = (id: string): void => {
    const timer = this.completionTimers.get(id)

    if (timer) {
      clearTimeout(timer)
      this.completionTimers.delete(id)
    }

    this.state$.actions.set(this.actions.filter((action) => action.id !== id))
  }

  dispose = (): void => {
    for (const timer of this.completionTimers.values()) {
      clearTimeout(timer)
    }

    this.completionTimers.clear()
    this.state$.actions.set([])
  }

  private updateAction(
    id: string,
    patch: Partial<Omit<AsyncActionItem, 'id'>> & Pick<AsyncActionItem, 'status' | 'updatedAt'>,
  ): void {
    this.state$.actions.set(
      this.actions.map((action) =>
        action.id === id
          ? {
              ...action,
              ...Object.fromEntries(
                Object.entries(patch).filter(([, value]) => value !== undefined),
              ),
            }
          : action,
      ),
    )
  }

  private scheduleDismiss(id: string): void {
    const existingTimer = this.completionTimers.get(id)

    if (existingTimer) {
      clearTimeout(existingTimer)
    }

    this.completionTimers.set(
      id,
      setTimeout(() => {
        this.dismissAction(id)
      }, 4_000),
    )
  }
}
