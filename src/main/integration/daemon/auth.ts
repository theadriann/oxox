export interface DaemonAuthProvider {
  getAccessToken?: () => string | undefined
  getApiKey?: () => string | undefined
}

export interface ResolvedDaemonCredentials {
  caller: string
  token?: string
  apiKey?: string
}

export interface DaemonRpcClient {
  request: <TResult>(method: string, params: unknown) => Promise<TResult>
}

const DEFAULT_CALLER = 'oxox'

export function resolveDaemonCredentials(
  authProvider?: DaemonAuthProvider,
): ResolvedDaemonCredentials | null {
  const token = authProvider?.getAccessToken?.()

  if (token) {
    return {
      caller: DEFAULT_CALLER,
      token,
    }
  }

  const apiKey = authProvider?.getApiKey?.()

  if (apiKey) {
    return {
      caller: DEFAULT_CALLER,
      apiKey,
    }
  }

  return null
}

export async function authenticateDaemonConnection(
  connection: DaemonRpcClient,
  authProvider?: DaemonAuthProvider | ResolvedDaemonCredentials,
): Promise<void> {
  const credentials =
    authProvider && 'caller' in authProvider ? authProvider : resolveDaemonCredentials(authProvider)

  if (!credentials) {
    throw new Error('Daemon authentication credentials are unavailable.')
  }

  await connection.request('daemon.authenticate', credentials)
}

export function createEnvironmentDaemonAuthProvider(
  environment: NodeJS.ProcessEnv = process.env,
): DaemonAuthProvider {
  return {
    getAccessToken: () =>
      environment.FACTORY_ACCESS_TOKEN ??
      environment.DAEMON_ACCESS_TOKEN ??
      environment.DROID_ACCESS_TOKEN,
    getApiKey: () =>
      environment.FACTORY_API_KEY ?? environment.DROID_API_KEY ?? environment.DAEMON_API_KEY,
  }
}
