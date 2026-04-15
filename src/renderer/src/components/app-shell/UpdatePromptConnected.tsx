import { observer } from 'mobx-react-lite'

import { useUpdateStore } from '../../stores/StoreProvider'
import { buildUpdatePromptProps } from './connectedSelectors'
import { UpdatePrompt } from './UpdatePrompt'

export const UpdatePromptConnected = observer(function UpdatePromptConnected() {
  const updateStore = useUpdateStore()
  const props = buildUpdatePromptProps({ updateStore })

  if (!props) {
    return null
  }

  return <UpdatePrompt {...props} />
})
