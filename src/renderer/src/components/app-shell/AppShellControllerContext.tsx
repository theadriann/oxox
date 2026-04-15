import { createContext, type PropsWithChildren, useContext } from 'react'

import type { useAppShellController } from './useAppShellController'

type AppShellControllerValue = ReturnType<typeof useAppShellController>

const AppShellControllerContext = createContext<AppShellControllerValue | null>(null)

interface AppShellControllerProviderProps extends PropsWithChildren {
  value: AppShellControllerValue
}

export function AppShellControllerProvider({ children, value }: AppShellControllerProviderProps) {
  return (
    <AppShellControllerContext.Provider value={value}>
      {children}
    </AppShellControllerContext.Provider>
  )
}

export function useAppShellControllerContext(): AppShellControllerValue {
  const value = useOptionalAppShellControllerContext()

  if (!value) {
    throw new Error('useAppShellControllerContext must be used within AppShellControllerProvider')
  }

  return value
}

export function useOptionalAppShellControllerContext(): AppShellControllerValue | null {
  return useContext(AppShellControllerContext)
}
