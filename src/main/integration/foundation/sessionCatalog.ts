import type { SessionRecord } from '../../../shared/ipc/contracts'
import type { ArtifactScanner, ArtifactScannerReport } from '../artifacts/scanner'
import type { DaemonTransport } from '../daemon/transport'
import type { DatabaseService } from '../database/service'
import { reconcileSessionRecords } from '../sessions/reconcile'

const DEFAULT_ARTIFACT_POLL_INTERVAL_MS = 10_000

type IntervalHandle = ReturnType<typeof setInterval>

export interface CreateFoundationSessionCatalogOptions {
  database: Pick<DatabaseService, 'listPersistedSessions' | 'listSessions'>
  scanner: Pick<ArtifactScanner, 'sync'>
  daemonTransport: Pick<DaemonTransport, 'listSessions'>
  onChange?: () => void
  pollIntervalMs?: number
  setIntervalFn?: (callback: () => void, delay: number) => IntervalHandle
  clearIntervalFn?: (interval: IntervalHandle) => void
}

export interface FoundationSessionCatalog {
  syncArtifacts: () => Promise<void>
  listSessions: () => SessionRecord[]
  close: () => void
}

export function createFoundationSessionCatalog(
  options: CreateFoundationSessionCatalogOptions,
): FoundationSessionCatalog {
  let artifactSessions = options.database.listPersistedSessions()
  let syncInFlight = false
  let activeSync: Promise<void> | null = null
  let resyncRequested = false

  const applySyncReport = (report: ArtifactScannerReport): void => {
    artifactSessions = options.database.listPersistedSessions()

    if (!report || report.processedCount > 0 || report.deletedCount > 0) {
      options.onChange?.()
    }
  }

  const runQueuedSync = async (): Promise<void> => {
    if (syncInFlight) {
      resyncRequested = true
      await activeSync
      return
    }

    do {
      resyncRequested = false
      const report = options.scanner.sync()

      if (!isPromiseLike(report)) {
        applySyncReport(report)
        continue
      }

      syncInFlight = true
      activeSync = report
        .then((resolvedReport) => {
          applySyncReport(resolvedReport)
        })
        .catch((error) => {
          console.error('Failed to synchronize session artifacts', error)
        })

      await activeSync
      activeSync = null
      syncInFlight = false
    } while (resyncRequested)
  }

  const syncArtifacts = async (): Promise<void> => {
    await runQueuedSync()
  }

  void syncArtifacts()

  const setIntervalFn = options.setIntervalFn ?? setInterval
  const clearIntervalFn = options.clearIntervalFn ?? clearInterval
  const artifactPollTimer = setIntervalFn(() => {
    void syncArtifacts()
  }, options.pollIntervalMs ?? DEFAULT_ARTIFACT_POLL_INTERVAL_MS)

  return {
    syncArtifacts,
    listSessions: () => {
      const cachedSessions = options.database.listPersistedSessions()
      const reconciledSessions = reconcileSessionRecords({
        cachedSessions,
        artifactSessions,
        daemonSessions: options.daemonTransport.listSessions(),
      })
      const liveOverlayById = new Map(
        options.database.listSessions().map((session) => [session.id, session]),
      )

      return reconciledSessions.map((session) => liveOverlayById.get(session.id) ?? session)
    },
    close: () => {
      clearIntervalFn(artifactPollTimer)
      void options.scanner.close?.()
    },
  }
}

function isPromiseLike<T>(value: T | Promise<T>): value is Promise<T> {
  return typeof value === 'object' && value !== null && 'then' in value
}
