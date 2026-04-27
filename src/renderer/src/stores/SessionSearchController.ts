import type {
  SessionSearchMatch,
  SessionSearchRequest,
  SessionSearchResponse,
} from '../../../shared/ipc/contracts'
import { bindMethods, observable, readField, writeField } from './legend'

export type SearchSessionsGateway = (
  request: SessionSearchRequest,
) => Promise<SessionSearchResponse>

interface SessionSearchControllerOptions {
  debounceMs?: number
}

export class SessionSearchController {
  readonly stateNode = observable({
    lastQuery: '',
    matches: [] as SessionSearchMatch[],
    isSearching: false,
    error: null as string | null,
  })

  private requestSequence = 0
  private scheduledSearchTimer: ReturnType<typeof setTimeout> | null = null
  private readonly debounceMs: number

  constructor(
    private readonly searchSessions?: SearchSessionsGateway,
    options: SessionSearchControllerOptions = {},
  ) {
    this.debounceMs = options.debounceMs ?? 150
    bindMethods(this)
  }

  get lastQuery(): string {
    return readField(this.stateNode, 'lastQuery')
  }

  set lastQuery(value: string) {
    writeField(this.stateNode, 'lastQuery', value)
  }

  get matches(): SessionSearchMatch[] {
    return readField(this.stateNode, 'matches')
  }

  set matches(value: SessionSearchMatch[]) {
    writeField(this.stateNode, 'matches', value)
  }

  get isSearching(): boolean {
    return readField(this.stateNode, 'isSearching')
  }

  set isSearching(value: boolean) {
    writeField(this.stateNode, 'isSearching', value)
  }

  get error(): string | null {
    return readField(this.stateNode, 'error')
  }

  set error(value: string | null) {
    writeField(this.stateNode, 'error', value)
  }

  scheduleSearch(query: string): void {
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

  dispose(): void {
    this.clearScheduledSearch()
    this.requestSequence += 1
  }

  async search(query: string): Promise<void> {
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
