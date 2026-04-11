import type { PluginCapabilitiesChangedPayload } from '../../shared/ipc/contracts'
import type { AppKernel } from './AppKernel'

interface StartPluginBootstrapOptions {
  appKernel: Pick<AppKernel, 'loadPlugins'>
  onCapabilitiesChanged: (payload: PluginCapabilitiesChangedPayload) => void
  onError: (error: unknown) => void
}

export async function startPluginBootstrap({
  appKernel,
  onCapabilitiesChanged,
  onError,
}: StartPluginBootstrapOptions): Promise<void> {
  try {
    await appKernel.loadPlugins()
    onCapabilitiesChanged({
      refreshedAt: new Date().toISOString(),
    })
  } catch (error) {
    onError(error)
  }
}
