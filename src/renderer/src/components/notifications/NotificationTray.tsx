import { Bell } from 'lucide-react'

import {
  minimizeNotifications,
  restoreNotifications,
  useNotificationCenterSnapshot,
} from './notificationCenter'

export function NotificationTray() {
  const snapshot = useNotificationCenterSnapshot()

  if (snapshot.count === 0) {
    return null
  }

  const noun = snapshot.count === 1 ? 'notification' : 'notifications'
  const action = snapshot.minimized ? 'show' : 'minimize'
  const label = snapshot.minimized
    ? `Notifications minimized, ${snapshot.count} ${noun}. Click to show.`
    : `Notifications, ${snapshot.count} ${noun}. Click to minimize.`

  return (
    <button
      aria-label={label}
      aria-pressed={snapshot.minimized}
      className="relative inline-flex h-5 items-center gap-1 rounded border border-fd-border-subtle bg-fd-panel/60 px-1.5 text-[10px] text-fd-secondary transition-colors hover:border-fd-border-default hover:bg-fd-elevated hover:text-fd-primary focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-fd-ember-400"
      title={label}
      type="button"
      onClick={() => {
        if (snapshot.minimized) {
          restoreNotifications()
          return
        }

        minimizeNotifications()
      }}
    >
      <Bell className="size-3" aria-hidden />
      <span className="rounded-full bg-fd-ember-500 px-1 font-mono text-[9px] leading-3 text-fd-inverse">
        {snapshot.count}
      </span>
      <span className="sr-only">{action} notifications</span>
    </button>
  )
}
