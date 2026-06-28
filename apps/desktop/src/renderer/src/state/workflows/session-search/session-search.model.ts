import type { Observable } from '@legendapp/state'
import type {
  SessionSearchRequest,
  SessionSearchResponse,
} from '../../../../../shared/ipc/contracts'
import { createSessionSearchState$, type SessionSearchState } from './session-search.state'

export type SearchSessionsGateway = (
  request: SessionSearchRequest,
) => Promise<SessionSearchResponse>

interface SessionSearchControllerOptions {
  debounceMs?: number
}

export class SessionSearchController {
  readonly state$: Observable<SessionSearchState> = createSessionSearchState$()

  private requestSequence = 0
  private scheduledSearchTimer: ReturnType<typeof setTimeout> | null = null
  private readonly debounceMs: number

  constructor(
    private readonly searchSessions?: SearchSessionsGateway,
    options: SessionSearchControllerOptions = {},
  ) {
    this.debounceMs = options.debounceMs ?? 150
  }

  get lastQuery(): string {
    return this.state$.lastQuery.get()
  }

  set lastQuery(value: string) {
    this.state$.lastQuery.set(value)
  }

  get matches(): SessionSearchMatch[] {
    return this.state$.matches.get()
  }

  set matches(value: SessionSearchMatch[]) {
    this.state$.matches.set(value)
  }

  get isSearching(): boolean {
    return this.state$.isSearching.get()
  }

  set isSearching(value: boolean) {
    this.state$.isSearching.set(value)
  }

  get error(): string | null {
    return this.state$.error.get()
  }

  set error(value: string | null) {
    this.state$.error.set(value)
  }

  scheduleSearch = (query: string): void => {
    this.clearScheduledSearch()
    const normalizedQuery = query.trim()
    this.requestSequence += 1
    const sequence = this.requestSequence
    this.lastQuery = normalizedQuery

    if (!normalizedQuery || !this.searchSessions) {
      this.matches = []
      this.isSearching = false
      this.error = null
      return
    }

    this.matches = []
    this.isSearching = true
    this.error = null
    this.scheduledSearchTimer = setTimeout(() => {
      this.scheduledSearchTimer = null
      void this.runSearch(normalizedQuery, sequence)
    }, this.debounceMs)
  }

  dispose = (): void => {
    this.clearScheduledSearch()
    this.requestSequence += 1
  }

  search = async (query: string): Promise<void> => {
    this.clearScheduledSearch()
    const normalizedQuery = query.trim()
    this.requestSequence += 1
    const sequence = this.requestSequence
    this.lastQuery = normalizedQuery

    if (!normalizedQuery || !this.searchSessions) {
      this.matches = []
      this.isSearching = false
      this.error = null
      return
    }

    this.isSearching = true
    this.error = null
    this.matches = []

    await this.runSearch(normalizedQuery, sequence)
  }

  private async runSearch(normalizedQuery: string, sequence: number): Promise<void> {
    if (!this.searchSessions) {
      return
    }

    try {
      const response = await this.searchSessions({ query: normalizedQuery })

      if (sequence !== this.requestSequence) {
        return
      }

      this.matches = response.matches
    } catch (error) {
      if (sequence !== this.requestSequence) {
        return
      }

      this.matches = []
      this.error = error instanceof Error ? error.message : 'Session search failed.'
    } finally {
      if (sequence === this.requestSequence) {
        this.isSearching = false
      }
    }
  }

  private clearScheduledSearch(): void {
    if (this.scheduledSearchTimer) {
      clearTimeout(this.scheduledSearchTimer)
      this.scheduledSearchTimer = null
    }
  }
}
