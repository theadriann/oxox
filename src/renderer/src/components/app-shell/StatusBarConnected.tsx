import { observer } from 'mobx-react-lite'

import { useStores } from '../../stores/StoreProvider'
import { StatusBar } from '../status-bar/StatusBar'
import { buildStatusBarProps } from './connectedSelectors'

export const StatusBarConnected = observer(function StatusBarConnected() {
  const { foundationStore, sessionStore } = useStores()
  const props = buildStatusBarProps({
    foundationStore,
    sessionStore,
  })

  return <StatusBar {...props} />
})
