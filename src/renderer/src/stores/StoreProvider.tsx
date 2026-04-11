import { createContext, type PropsWithChildren, useContext, useState } from 'react'

import { createRendererPlatformApiClient } from '../platform/apiClient'
import { RootStore } from './RootStore'

export interface StoreContextValue {
  rootStore: RootStore
  composerStore: RootStore['composerStore']
  foundationStore: RootStore['foundationStore']
  liveSessionStore: RootStore['liveSessionStore']
  pluginCapabilityStore: RootStore['pluginCapabilityStore']
  pluginHostStore: RootStore['pluginHostStore']
  sessionStore: RootStore['sessionStore']
  transcriptStore: RootStore['transcriptStore']
  transportStore: RootStore['transportStore']
  uiStore: RootStore['uiStore']
}

function createStores(
  rootStore: RootStore = new RootStore(createRendererPlatformApiClient()),
): StoreContextValue {
  return {
    rootStore,
    composerStore: rootStore.composerStore,
    foundationStore: rootStore.foundationStore,
    liveSessionStore: rootStore.liveSessionStore,
    pluginCapabilityStore: rootStore.pluginCapabilityStore,
    pluginHostStore: rootStore.pluginHostStore,
    sessionStore: rootStore.sessionStore,
    transcriptStore: rootStore.transcriptStore,
    transportStore: rootStore.transportStore,
    uiStore: rootStore.uiStore,
  }
}

const StoreContext = createContext<StoreContextValue | null>(null)

interface StoreProviderProps extends PropsWithChildren {
  rootStore?: RootStore
}

export function StoreProvider({ children, rootStore }: StoreProviderProps) {
  const [stores] = useState<StoreContextValue>(() => createStores(rootStore))

  return <StoreContext.Provider value={stores}>{children}</StoreContext.Provider>
}

export function useStores(): StoreContextValue {
  const stores = useContext(StoreContext)

  if (!stores) {
    throw new Error('useStores must be used within a StoreProvider')
  }

  return stores
}
