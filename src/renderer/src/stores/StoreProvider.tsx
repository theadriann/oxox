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
  sessionRuntimeCatalogStore: RootStore['sessionRuntimeCatalogStore']
  sessionStore: RootStore['sessionStore']
  transcriptStore: RootStore['transcriptStore']
  transportStore: RootStore['transportStore']
  uiStore: RootStore['uiStore']
  updateStore: RootStore['updateStore']
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
    sessionRuntimeCatalogStore: rootStore.sessionRuntimeCatalogStore,
    sessionStore: rootStore.sessionStore,
    transcriptStore: rootStore.transcriptStore,
    transportStore: rootStore.transportStore,
    uiStore: rootStore.uiStore,
    updateStore: rootStore.updateStore,
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

function useStoreContext(): StoreContextValue {
  const stores = useContext(StoreContext)

  if (!stores) {
    throw new Error('useStores must be used within a StoreProvider')
  }

  return stores
}

export function useStores(): StoreContextValue {
  return useStoreContext()
}

export function useRootStore(): StoreContextValue['rootStore'] {
  return useStoreContext().rootStore
}

export function useComposerStore(): StoreContextValue['composerStore'] {
  return useStoreContext().composerStore
}

export function useFoundationStore(): StoreContextValue['foundationStore'] {
  return useStoreContext().foundationStore
}

export function useLiveSessionStore(): StoreContextValue['liveSessionStore'] {
  return useStoreContext().liveSessionStore
}

export function usePluginCapabilityStore(): StoreContextValue['pluginCapabilityStore'] {
  return useStoreContext().pluginCapabilityStore
}

export function usePluginHostStore(): StoreContextValue['pluginHostStore'] {
  return useStoreContext().pluginHostStore
}

export function useSessionStore(): StoreContextValue['sessionStore'] {
  return useStoreContext().sessionStore
}

export function useSessionRuntimeCatalogStore(): StoreContextValue['sessionRuntimeCatalogStore'] {
  return useStoreContext().sessionRuntimeCatalogStore
}

export function useTranscriptStore(): StoreContextValue['transcriptStore'] {
  return useStoreContext().transcriptStore
}

export function useTransportStore(): StoreContextValue['transportStore'] {
  return useStoreContext().transportStore
}

export function useUIStore(): StoreContextValue['uiStore'] {
  return useStoreContext().uiStore
}

export function useUpdateStore(): StoreContextValue['updateStore'] {
  return useStoreContext().updateStore
}
