const rendererSessionAttachments = new Map<number, Set<string>>()

export function registerRendererSessionAttachment(rendererId: number, sessionId: string): void {
  const attachments = rendererSessionAttachments.get(rendererId) ?? new Set<string>()
  attachments.add(sessionId)
  rendererSessionAttachments.set(rendererId, attachments)
}

export function removeRendererSessionAttachment(rendererId: number, sessionId: string): void {
  const attachments = rendererSessionAttachments.get(rendererId)

  if (!attachments) {
    return
  }

  attachments.delete(sessionId)

  if (attachments.size === 0) {
    rendererSessionAttachments.delete(rendererId)
  }
}

export function listRendererSessionAttachments(rendererId: number): string[] {
  return [...(rendererSessionAttachments.get(rendererId) ?? [])]
}

export function clearRendererSessionAttachments(rendererId: number): void {
  rendererSessionAttachments.delete(rendererId)
}

export function isRendererAttachedToSession(rendererId: number, sessionId: string): boolean {
  return rendererSessionAttachments.get(rendererId)?.has(sessionId) ?? false
}
