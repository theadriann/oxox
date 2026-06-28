type DisposableService = {
  dispose?: () => void
  close?: () => void
}

export class ServiceRegistry {
  private readonly services = new Map<string, unknown>()

  register<TService>(key: string, service: TService): TService {
    this.services.set(key, service)
    return service
  }

  has(key: string): boolean {
    return this.services.has(key)
  }

  get<TService>(key: string): TService | undefined {
    return this.services.get(key) as TService | undefined
  }

  getOrThrow<TService>(key: string): TService {
    const service = this.get<TService>(key)

    if (!service) {
      throw new Error(`Service "${key}" has not been registered.`)
    }

    return service
  }

  clear(): void {
    this.services.clear()
  }

  disposeAll(): void {
    const entries = Array.from(this.services.values()).reverse()

    this.services.clear()

    for (const service of entries) {
      if (!service || typeof service !== 'object') {
        continue
      }

      const disposableService = service as DisposableService

      if (typeof disposableService.dispose === 'function') {
        disposableService.dispose()
        continue
      }

      if (typeof disposableService.close === 'function') {
        disposableService.close()
      }
    }
  }
}
