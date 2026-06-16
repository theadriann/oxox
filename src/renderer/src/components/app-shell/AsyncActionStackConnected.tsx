import { useValue } from '@legendapp/state/react'
import { useComposerStore } from '../../state/root/store-provider'
import { AsyncActionStack } from './AsyncActionStack'

export function AsyncActionStackConnected() {
  const composerStore = useComposerStore()
  const actions = useValue(() => composerStore.asyncActionsStore.actions)

  return (
    <AsyncActionStack actions={actions} onDismiss={composerStore.asyncActionsStore.dismissAction} />
  )
}
