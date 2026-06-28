import {
  type Computer,
  type ComputerListResponse,
  type ComputerMetricsResponse,
  type CreateComputerOptions,
  createComputer,
  type DeleteComputerOptions,
  deleteComputer,
  type GetComputerByNameOptions,
  type GetComputerMetricsOptions,
  type GetComputerOptions,
  type GetMachineTemplateOptions,
  getComputer,
  getComputerByName,
  getComputerMetrics,
  getMachineTemplate,
  type ListComputersOptions,
  type ListMachineTemplatesOptions,
  type ListRemoteSessionsOptions,
  listComputers,
  listMachineTemplates,
  listRemoteSessions,
  type MachineTemplate,
  type MachineTemplateListResponse,
  type RefreshComputerOptions,
  type RefreshComputerResponse,
  type RemoteSessionListResponse,
  type RestartComputerOptions,
  type RetryInstallDepsOptions,
  refreshComputer,
  restartComputer,
  retryInstallDeps,
  type UpdateComputerOptions,
  updateComputer,
} from '@factory/droid-sdk'

type ApiOptionsWithoutCredentials<TOptions extends { apiKey: string; baseUrl?: string }> = Omit<
  TOptions,
  'apiKey' | 'baseUrl'
>

export interface FactoryApiAuthProvider {
  getApiKey: () => string | undefined
}

export interface FactoryApiSdk {
  listMachineTemplates: (
    options: ListMachineTemplatesOptions,
  ) => Promise<MachineTemplateListResponse>
  getMachineTemplate: (options: GetMachineTemplateOptions) => Promise<MachineTemplate>
  listComputers: (options: ListComputersOptions) => Promise<ComputerListResponse>
  getComputer: (options: GetComputerOptions) => Promise<Computer>
  createComputer: (options: CreateComputerOptions) => Promise<Computer>
  getComputerByName: (options: GetComputerByNameOptions) => Promise<Computer>
  updateComputer: (options: UpdateComputerOptions) => Promise<Computer>
  deleteComputer: (options: DeleteComputerOptions) => Promise<void>
  restartComputer: (options: RestartComputerOptions) => Promise<void>
  refreshComputer: (options: RefreshComputerOptions) => Promise<RefreshComputerResponse>
  getComputerMetrics: (options: GetComputerMetricsOptions) => Promise<ComputerMetricsResponse>
  retryInstallDeps: (options: RetryInstallDepsOptions) => Promise<Computer>
  listRemoteSessions: (options: ListRemoteSessionsOptions) => Promise<RemoteSessionListResponse>
}

export interface FactoryApiService {
  listMachineTemplates: (
    options?: ApiOptionsWithoutCredentials<ListMachineTemplatesOptions>,
  ) => Promise<MachineTemplateListResponse>
  getMachineTemplate: (
    options: ApiOptionsWithoutCredentials<GetMachineTemplateOptions>,
  ) => Promise<MachineTemplate>
  listComputers: (
    options?: ApiOptionsWithoutCredentials<ListComputersOptions>,
  ) => Promise<ComputerListResponse>
  getComputer: (options: ApiOptionsWithoutCredentials<GetComputerOptions>) => Promise<Computer>
  createComputer: (
    options: ApiOptionsWithoutCredentials<CreateComputerOptions>,
  ) => Promise<Computer>
  getComputerByName: (
    options: ApiOptionsWithoutCredentials<GetComputerByNameOptions>,
  ) => Promise<Computer>
  updateComputer: (
    options: ApiOptionsWithoutCredentials<UpdateComputerOptions>,
  ) => Promise<Computer>
  deleteComputer: (options: ApiOptionsWithoutCredentials<DeleteComputerOptions>) => Promise<void>
  restartComputer: (options: ApiOptionsWithoutCredentials<RestartComputerOptions>) => Promise<void>
  refreshComputer: (
    options: ApiOptionsWithoutCredentials<RefreshComputerOptions>,
  ) => Promise<RefreshComputerResponse>
  getComputerMetrics: (
    options: ApiOptionsWithoutCredentials<GetComputerMetricsOptions>,
  ) => Promise<ComputerMetricsResponse>
  retryInstallDeps: (
    options: ApiOptionsWithoutCredentials<RetryInstallDepsOptions>,
  ) => Promise<Computer>
  listRemoteSessions: (
    options?: ApiOptionsWithoutCredentials<ListRemoteSessionsOptions>,
  ) => Promise<RemoteSessionListResponse>
}

export interface CreateFactoryApiServiceOptions {
  authProvider?: FactoryApiAuthProvider
  baseUrl?: string
  sdk?: Partial<FactoryApiSdk>
}

const defaultSdk: FactoryApiSdk = {
  listMachineTemplates,
  getMachineTemplate,
  listComputers,
  getComputer,
  createComputer,
  getComputerByName,
  updateComputer,
  deleteComputer,
  restartComputer,
  refreshComputer,
  getComputerMetrics,
  retryInstallDeps,
  listRemoteSessions,
}

export function createEnvironmentFactoryApiAuthProvider(
  environment: NodeJS.ProcessEnv = process.env,
): FactoryApiAuthProvider {
  return {
    getApiKey: () =>
      environment.FACTORY_API_KEY ?? environment.DROID_API_KEY ?? environment.DAEMON_API_KEY,
  }
}

export function createFactoryApiService({
  authProvider = createEnvironmentFactoryApiAuthProvider(),
  baseUrl,
  sdk: sdkOverrides,
}: CreateFactoryApiServiceOptions = {}): FactoryApiService {
  const sdk = { ...defaultSdk, ...sdkOverrides }

  const withCredentials = <TOptions extends Record<string, unknown>>(
    options?: TOptions,
  ): TOptions & { apiKey: string; baseUrl?: string } => {
    const apiKey = authProvider.getApiKey()

    if (!apiKey) {
      throw new Error('Factory API key is unavailable.')
    }

    return {
      ...(options ?? ({} as TOptions)),
      apiKey,
      ...(baseUrl ? { baseUrl } : {}),
    }
  }

  return {
    listMachineTemplates: async (options = {}) =>
      sdk.listMachineTemplates(withCredentials(options)),
    getMachineTemplate: async (options) => sdk.getMachineTemplate(withCredentials(options)),
    listComputers: async (options = {}) => sdk.listComputers(withCredentials(options)),
    getComputer: async (options) => sdk.getComputer(withCredentials(options)),
    createComputer: async (options) => sdk.createComputer(withCredentials(options)),
    getComputerByName: async (options) => sdk.getComputerByName(withCredentials(options)),
    updateComputer: async (options) => sdk.updateComputer(withCredentials(options)),
    deleteComputer: async (options) => sdk.deleteComputer(withCredentials(options)),
    restartComputer: async (options) => sdk.restartComputer(withCredentials(options)),
    refreshComputer: async (options) => sdk.refreshComputer(withCredentials(options)),
    getComputerMetrics: async (options) => sdk.getComputerMetrics(withCredentials(options)),
    retryInstallDeps: async (options) => sdk.retryInstallDeps(withCredentials(options)),
    listRemoteSessions: async (options = {}) => sdk.listRemoteSessions(withCredentials(options)),
  }
}
