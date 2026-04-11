export interface TextSegment {
  kind: 'text'
  content: string
}

export interface SystemReminderSegment {
  kind: 'system-reminder'
  content: string
}

export type MessageSegment = TextSegment | SystemReminderSegment

const SYSTEM_REMINDER_REGEX = /<system-reminder>\s*([\s\S]*?)\s*<\/system-reminder>/g

export function parseMessageSegments(text: string): MessageSegment[] {
  const segments: MessageSegment[] = []
  let lastIndex = 0

  for (const match of text.matchAll(SYSTEM_REMINDER_REGEX)) {
    const matchStart = match.index ?? 0

    if (matchStart > lastIndex) {
      const before = text.slice(lastIndex, matchStart).trim()

      if (before.length > 0) {
        segments.push({ kind: 'text', content: before })
      }
    }

    const reminderContent = match[1]?.trim() ?? ''

    if (reminderContent.length > 0) {
      segments.push({ kind: 'system-reminder', content: reminderContent })
    }

    lastIndex = matchStart + match[0].length
  }

  if (lastIndex < text.length) {
    const after = text.slice(lastIndex).trim()

    if (after.length > 0) {
      segments.push({ kind: 'text', content: after })
    }
  }

  if (segments.length === 0 && text.trim().length > 0) {
    segments.push({ kind: 'text', content: text.trim() })
  }

  return segments
}
