import type {
  SessionSearchMatch,
  SessionSearchRequest,
  SessionSearchResponse,
} from '../../../shared/ipc/contracts'
import { bindMethods, observable, readField, writeField } from './legend'

export type SearchSessionsGateway = (
  request: SessionSearchRequest,
) => Promise<SessionSearchResponse>

export class SessionSearchController {
  readonly stateNode = observable({
    lastQuery: '',
    matches: [] as SessionSearchMatch[],
    isSearching: false,
    error: null as string | null,
  })

  private requestSequence = 0

  constructor(private readonly searchSessions?: SearchSessionsGateway) {
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

  async search(query: string): Promise<void> {
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
}
