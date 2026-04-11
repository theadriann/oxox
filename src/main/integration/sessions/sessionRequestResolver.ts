import type { LiveSessionAskUserAnswerRecord } from '../../../shared/ipc/contracts'
import { requireManagedTransport } from './sessionState'
import type { ManagedSession } from './types'

export interface SessionRequestResolverOptions {
  getSession: (sessionId: string) => ManagedSession
}

export function createSessionRequestResolver(options: SessionRequestResolverOptions) {
  return {
    async resolvePermissionRequest(
      sessionId: string,
      requestId: string,
      selectedOption: string,
    ): Promise<void> {
      const session = options.getSession(sessionId)
      await requireManagedTransport(session).resolvePermissionRequest(requestId, selectedOption)
    },

    async resolveAskUserRequest(
      sessionId: string,
      requestId: string,
      answers: LiveSessionAskUserAnswerRecord[],
    ): Promise<void> {
      const session = options.getSession(sessionId)
      await requireManagedTransport(session).resolveAskUserRequest(requestId, answers)
    },
  }
}
