import type { SessionRecord } from '../../../shared/ipc/contracts'
import type {
  ArtifactScanner,
  ArtifactScannerProgress,
  ArtifactScannerReport,
  ArtifactScannerSyncOptions,
} from '../artifacts/scanner'
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
  reindexArtifacts: (
    onProgress?: (progress: ArtifactScannerProgress) => void,
  ) => Promise<ArtifactScannerReport>
  listSessions: () => SessionRecord[]
  close: () => void
}

export function createFoundationSessionCatalog(
  options: CreateFoundationSessionCatalogOptions,
): FoundationSessionCatalog {
  let artifactSessions = options.database.listPersistedSessions()
  let syncInFlight = false
  let activeSync: Promise<ArtifactScannerReport> | null = null
  let resyncRequested = false

  const applySyncReport = (report: ArtifactScannerReport): void => {
    artifactSessions = options.database.listPersistedSessions()

    if (
      !report ||
      report.processedCount > 0 ||
      report.deletedCount > 0 ||
      (report.lineageBackfilledCount ?? 0) > 0
    ) {
      options.onChange?.()
    }
  }

  const runQueuedSync = async (
    syncOptions?: ArtifactScannerSyncOptions,
  ): Promise<ArtifactScannerReport> => {
    let latestReport: ArtifactScannerReport | null = null

    if (syncInFlight) {
      if (!syncOptions?.force) {
        resyncRequested = true
      }
      await activeSync

      if (!syncOptions?.force) {
        return createEmptyScannerReport()
      }
    }

    do {
      resyncRequested = false
      const report = options.scanner.sync(syncOptions)

      if (!isPromiseLike(report)) {
        applySyncReport(report)
        latestReport = report
        continue
      }

      syncInFlight = true
      activeSync = report
        .then((resolvedReport) => {
          applySyncReport(resolvedReport)
          latestReport = resolvedReport
          return resolvedReport
        })
        .catch((error) => {
          console.error('Failed to synchronize session artifacts', error)
          return createEmptyScannerReport()
        })

      await activeSync
      activeSync = null
      syncInFlight = false
    } while (resyncRequested)

    return latestReport ?? createEmptyScannerReport()
  }

  const syncArtifacts = async (): Promise<void> => {
    await runQueuedSync()
  }

  const reindexArtifacts = async (
    onProgress?: (progress: ArtifactScannerProgress) => void,
  ): Promise<ArtifactScannerReport> => {
    return runQueuedSync({ force: true, onProgress })
  }

  void syncArtifacts()

  const setIntervalFn = options.setIntervalFn ?? setInterval
  const clearIntervalFn = options.clearIntervalFn ?? clearInterval
  const artifactPollTimer = setIntervalFn(() => {
    void syncArtifacts()
  }, options.pollIntervalMs ?? DEFAULT_ARTIFACT_POLL_INTERVAL_MS)

  return {
    syncArtifacts,
    reindexArtifacts,
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

function createEmptyScannerReport(): ArtifactScannerReport {
  return {
    deletedCount: 0,
    durationMs: 0,
    processedCount: 0,
    skippedCount: 0,
    unreadableCount: 0,
  }
}

function isPromiseLike<T>(value: T | Promise<T>): value is Promise<T> {
  return typeof value === 'object' && value !== null && 'then' in value
}
