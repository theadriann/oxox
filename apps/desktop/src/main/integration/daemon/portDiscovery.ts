export interface DiscoverReachableDaemonPortOptions {
  resolveCandidatePorts: () => Promise<number[]>
  tryPort: (port: number) => Promise<void>
}

export interface DiscoverReachableDaemonPortResult {
  connectedPort: number | null
  lastError: Error | null
}

export async function discoverReachableDaemonPort(
  options: DiscoverReachableDaemonPortOptions,
): Promise<DiscoverReachableDaemonPortResult> {
  const candidatePorts = await options.resolveCandidatePorts()
  let lastError: Error | null = null

  for (const port of candidatePorts) {
    try {
      await options.tryPort(port)
      return {
        connectedPort: port,
        lastError: null,
      }
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error))
    }
  }

  return {
    connectedPort: null,
    lastError,
  }
}
