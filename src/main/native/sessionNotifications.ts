import { Notification, type NotificationConstructorOptions, type Tray } from 'electron'

import type { LiveSessionNotificationSummary } from '../integration/sessions/types'

type TrayBadgeTarget = Pick<Tray, 'setTitle' | 'setToolTip'>

interface PendingSessionRequests {
  permissions: LiveSessionNotificationSummary['pendingPermissions']
  askUser: LiveSessionNotificationSummary['pendingAskUser']
  completionCount: number
}

interface SessionNotificationState {
  seenPermissionRequestIds: Set<string>
  seenAskUserRequestIds: Set<string>
  completionCountBySessionId: Map<string, number>
}

interface NativeNotificationLike {
  show: () => void
  on: (event: 'click', listener: () => void) => void
}

interface TimerScheduler {
  setInterval: (callback: () => void, delay: number) => ReturnType<typeof setInterval>
  clearInterval: (timer: ReturnType<typeof setInterval>) => void
}

export interface SessionNotificationController {
  sync: () => void
  stop: () => void
}

export interface StartSessionNotificationControllerOptions {
  appName: string
  getSessionSummaries: () => LiveSessionNotificationSummary[]
  getTray: () => TrayBadgeTarget | null
  isAppInBackground: () => boolean
  onNavigateToSession: (sessionId: string) => void
  notificationFactory?: (options: NotificationConstructorOptions) => NativeNotificationLike
  notificationsSupported?: boolean
  pollIntervalMs?: number
  scheduler?: TimerScheduler
}

const DEFAULT_POLL_INTERVAL_MS = 500

export function startSessionNotificationController(
  options: StartSessionNotificationControllerOptions,
): SessionNotificationController {
  const scheduler = options.scheduler ?? {
    setInterval: (callback, delay) => setInterval(callback, delay),
    clearInterval: (timer) => clearInterval(timer),
  }
  const notificationFactory =
    options.notificationFactory ?? ((notificationOptions) => new Notification(notificationOptions))
  const notificationsSupported =
    options.notificationsSupported ??
    (options.notificationFactory ? true : Notification.isSupported())

  let state: SessionNotificationState = {
    seenPermissionRequestIds: new Set<string>(),
    seenAskUserRequestIds: new Set<string>(),
    completionCountBySessionId: new Map<string, number>(),
  }

  const sync = () => {
    const sessionSummaries = options.getSessionSummaries()
    const isBackground = options.isAppInBackground()
    let badgeCount = 0
    const nextCompletionCounts = new Map<string, number>()

    for (const summary of sessionSummaries) {
      const pending = toPendingSessionRequests(summary)
      badgeCount += pending.permissions.length + pending.askUser.length
      nextCompletionCounts.set(summary.sessionId, pending.completionCount)

      if (isBackground && notificationsSupported) {
        for (const request of pending.permissions) {
          if (state.seenPermissionRequestIds.has(request.requestId)) {
            continue
          }

          showNativeNotification(
            notificationFactory,
            {
              title: `Needs permission · ${summary.title}`,
              body: truncateNotificationText(
                request.reason ?? 'Resolve the permission request in OXOX.',
              ),
            },
            summary.sessionId,
            options.onNavigateToSession,
          )
        }

        for (const request of pending.askUser) {
          if (state.seenAskUserRequestIds.has(request.requestId)) {
            continue
          }

          showNativeNotification(
            notificationFactory,
            {
              title: `Needs your input · ${summary.title}`,
              body: truncateNotificationText(
                request.prompt ?? 'Review the session callback in OXOX.',
              ),
            },
            summary.sessionId,
            options.onNavigateToSession,
          )
        }

        const previousCompletionCount = state.completionCountBySessionId.get(summary.sessionId)

        if (
          typeof previousCompletionCount === 'number' &&
          pending.completionCount > previousCompletionCount
        ) {
          showNativeNotification(
            notificationFactory,
            {
              title: `Completed · ${summary.title}`,
              body: `${summary.title} finished running. Restore OXOX to review the latest transcript output.`,
            },
            summary.sessionId,
            options.onNavigateToSession,
          )
        }
      }

      for (const request of pending.permissions) {
        state.seenPermissionRequestIds.add(request.requestId)
      }

      for (const request of pending.askUser) {
        state.seenAskUserRequestIds.add(request.requestId)
      }
    }

    state = {
      seenPermissionRequestIds: state.seenPermissionRequestIds,
      seenAskUserRequestIds: state.seenAskUserRequestIds,
      completionCountBySessionId: nextCompletionCounts,
    }

    updateTrayBadge(options.getTray(), options.appName, badgeCount)
  }

  sync()
  const timer = scheduler.setInterval(sync, options.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS)

  return {
    sync,
    stop: () => {
      scheduler.clearInterval(timer)
    },
  }
}

function toPendingSessionRequests(summary: LiveSessionNotificationSummary): PendingSessionRequests {
  return {
    permissions: summary.pendingPermissions,
    askUser: summary.pendingAskUser,
    completionCount: summary.completionCount,
  }
}

function updateTrayBadge(tray: TrayBadgeTarget | null, appName: string, badgeCount: number): void {
  if (!tray) {
    return
  }

  tray.setTitle(badgeCount > 0 ? String(badgeCount) : '')
  tray.setToolTip(
    badgeCount > 0
      ? `${appName} · ${badgeCount} pending action${badgeCount === 1 ? '' : 's'}`
      : appName,
  )
}

function showNativeNotification(
  notificationFactory: (options: NotificationConstructorOptions) => NativeNotificationLike,
  options: NotificationConstructorOptions,
  sessionId: string,
  onNavigateToSession: (sessionId: string) => void,
): void {
  const notification = notificationFactory(options)
  notification.on('click', () => {
    onNavigateToSession(sessionId)
  })
  notification.show()
}

function truncateNotificationText(text: string): string {
  const normalized = text.trim()

  if (normalized.length <= 120) {
    return normalized
  }

  return `${normalized.slice(0, 117).trimEnd()}…`
}
