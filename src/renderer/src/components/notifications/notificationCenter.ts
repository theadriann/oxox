import { useSyncExternalStore } from 'react'
import { toast } from 'sonner'

export interface AppNotification {
  id: string
  kind: 'error' | 'success' | 'warning'
  title: string
  description: string
}

export interface NotificationCenterSnapshot {
  count: number
  minimized: boolean
  notifications: AppNotification[]
}

const MAX_RESTORED_TOASTS = 3
const TOAST_DURATION_MS = 4_000

let notifications: AppNotification[] = []
let minimized = false
let snapshot: NotificationCenterSnapshot = createSnapshot()
const listeners = new Set<() => void>()

export function getNotificationCenterSnapshot(): NotificationCenterSnapshot {
  return snapshot
}

export function subscribeNotificationCenter(listener: () => void): () => void {
  listeners.add(listener)

  return () => {
    listeners.delete(listener)
  }
}

export function useNotificationCenterSnapshot(): NotificationCenterSnapshot {
  return useSyncExternalStore(
    subscribeNotificationCenter,
    getNotificationCenterSnapshot,
    getNotificationCenterSnapshot,
  )
}

export function showAppNotification(notification: AppNotification): void {
  if (notifications.some((entry) => entry.id === notification.id)) {
    return
  }

  notifications = [notification, ...notifications].slice(0, 50)
  refreshSnapshot()
  notifyListeners()

  if (!minimized) {
    showToast(notification)
  }
}

export function minimizeNotifications(): void {
  if (notifications.length === 0) {
    return
  }

  minimized = true
  toast.dismiss()
  refreshSnapshot()
  notifyListeners()
}

export function restoreNotifications(): void {
  if (notifications.length === 0) {
    return
  }

  minimized = false
  refreshSnapshot()
  notifyListeners()

  for (const notification of notifications.slice(0, MAX_RESTORED_TOASTS).reverse()) {
    showToast(notification)
  }
}

export function resetNotificationCenterForTesting(): void {
  notifications = []
  minimized = false
  refreshSnapshot()
  notifyListeners()
}

function showToast(notification: AppNotification): void {
  toast[notification.kind](notification.title, {
    description: notification.description,
    duration: TOAST_DURATION_MS,
    id: notification.id,
  })
}

function notifyListeners(): void {
  for (const listener of listeners) {
    listener()
  }
}

function refreshSnapshot(): void {
  snapshot = createSnapshot()
}

function createSnapshot(): NotificationCenterSnapshot {
  return {
    count: notifications.length,
    minimized,
    notifications,
  }
}
