import { useValue } from '../../stores/legend'
import { useUpdateStore } from '../../stores/StoreProvider'
import { buildUpdatePromptProps } from './connectedSelectors'
import { UpdatePrompt } from './UpdatePrompt'

export function UpdatePromptConnected() {
  const updateStore = useUpdateStore()
  const props = useValue(() => buildUpdatePromptProps({ updateStore }))

  if (!props) {
    return null
  }

  return <UpdatePrompt {...props} />
}
