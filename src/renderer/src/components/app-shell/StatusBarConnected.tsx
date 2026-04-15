import { observer } from 'mobx-react-lite'

import { useFoundationStore, useSessionStore, useUpdateStore } from '../../stores/StoreProvider'
import { StatusBar } from '../status-bar/StatusBar'
import { buildStatusBarProps } from './connectedSelectors'

export const StatusBarConnected = observer(function StatusBarConnected() {
  const foundationStore = useFoundationStore()
  const sessionStore = useSessionStore()
  const updateStore = useUpdateStore()
  const props = buildStatusBarProps({
    foundationStore,
    updateStore,
    sessionStore,
  })

  return <StatusBar {...props} />
})
