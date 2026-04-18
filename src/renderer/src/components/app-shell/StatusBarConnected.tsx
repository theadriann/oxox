import { useValue } from '../../stores/legend'
import { useFoundationStore, useSessionStore, useUpdateStore } from '../../stores/StoreProvider'
import { StatusBar } from '../status-bar/StatusBar'
import { buildStatusBarProps } from './connectedSelectors'

export function StatusBarConnected() {
  const foundationStore = useFoundationStore()
  const sessionStore = useSessionStore()
  const updateStore = useUpdateStore()
  const props = useValue(() =>
    buildStatusBarProps({
      foundationStore,
      updateStore,
      sessionStore,
    }),
  )

  return <StatusBar {...props} />
}
