export function toTimestamp(value: string | null | undefined): number {
  if (!value) {
    return 0
  }

  const timestamp = Date.parse(value)
  return Number.isNaN(timestamp) ? 0 : timestamp
}

export function formatRelativeSessionTime(
  value: string | null | undefined,
  now = Date.now(),
): string {
  const timestamp = toTimestamp(value)

  if (timestamp <= 0) {
    return 'Just now'
  }

  const diffSeconds = Math.max(0, Math.round((now - timestamp) / 1000))

  if (diffSeconds < 45) {
    return 'Just now'
  }

  if (diffSeconds < 90) {
    return '1m ago'
  }

  const diffMinutes = Math.round(diffSeconds / 60)

  if (diffMinutes < 60) {
    return `${diffMinutes}m ago`
  }

  const diffHours = Math.round(diffMinutes / 60)

  if (diffHours < 24) {
    return `${diffHours}h ago`
  }

  const diffDays = Math.round(diffHours / 24)
  return `${diffDays}d ago`
}

export function deriveProjectLabel(
  workspacePath: string | null,
  displayName: string | null,
): string {
  if (displayName?.trim()) {
    return displayName.trim()
  }

  if (!workspacePath?.trim()) {
    return 'Unassigned project'
  }

  const sanitized = workspacePath.replace(/[\\/]+$/, '')
  const parts = sanitized.split(/[\\/]/).filter(Boolean)

  return parts.at(-1) ?? workspacePath
}

const UTC_MONTHS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
]

export function formatAbsoluteSessionTime(value: string | null | undefined): string {
  const timestamp = toTimestamp(value)

  if (timestamp <= 0) {
    return 'Unavailable'
  }

  const date = new Date(timestamp)
  const month = UTC_MONTHS[date.getUTCMonth()] ?? '—'
  const day = String(date.getUTCDate()).padStart(2, '0')
  const year = date.getUTCFullYear()
  const hours = String(date.getUTCHours()).padStart(2, '0')
  const minutes = String(date.getUTCMinutes()).padStart(2, '0')

  return `${month} ${day}, ${year}, ${hours}:${minutes} UTC`
}

export function formatElapsedDuration(start: string | null | undefined, now = Date.now()): string {
  const startTimestamp = toTimestamp(start)

  if (startTimestamp <= 0) {
    return '0s'
  }

  const totalSeconds = Math.max(0, Math.floor((now - startTimestamp) / 1000))
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60

  if (hours > 0) {
    return `${hours}h ${minutes}m`
  }

  if (minutes > 0) {
    return `${minutes}m ${seconds}s`
  }

  return `${seconds}s`
}
