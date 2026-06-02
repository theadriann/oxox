export function getNextToolInputMarkdown(
  previousInputMarkdown: string | null | undefined,
  detail: string | null,
): string | null {
  const candidate = classifyToolInputDetail(detail)
  if (!candidate) {
    return previousInputMarkdown ?? null
  }

  if (candidate.meaningful) {
    return candidate.markdown
  }

  const previousCandidate = classifyToolInputDetail(previousInputMarkdown ?? null)
  if (previousCandidate?.meaningful) {
    return previousInputMarkdown ?? null
  }

  return previousInputMarkdown ?? candidate.markdown
}

export function isToolInputDetail(value: string | null): boolean {
  return classifyToolInputDetail(value) !== null
}

interface ToolInputCandidate {
  markdown: string
  meaningful: boolean
}

function classifyToolInputDetail(value: string | null): ToolInputCandidate | null {
  if (!value) return null

  if (value.includes('*** Begin Patch')) {
    return { markdown: value, meaningful: true }
  }

  const trimmed = value.trim()
  const fencedJson = extractFencedJson(trimmed)
  const jsonText = fencedJson ?? (looksLikeJson(trimmed) ? trimmed : null)
  if (!jsonText) return null

  try {
    const parsed = JSON.parse(jsonText) as unknown
    if (!isJsonContainer(parsed)) return null

    return {
      markdown: fencedJson ? value : `\`\`\`json\n${JSON.stringify(parsed, null, 2)}\n\`\`\``,
      meaningful: hasMeaningfulJsonContent(parsed),
    }
  } catch {
    return null
  }
}

function extractFencedJson(value: string): string | null {
  const match = value.match(/^```(?:json)?\n([\s\S]*?)\n```$/)
  return match?.[1] ?? null
}

function looksLikeJson(value: string): boolean {
  return (
    (value.startsWith('{') && value.endsWith('}')) || (value.startsWith('[') && value.endsWith(']'))
  )
}

function isJsonContainer(value: unknown): value is Record<string, unknown> | unknown[] {
  return Array.isArray(value) || (typeof value === 'object' && value !== null)
}

function hasMeaningfulJsonContent(value: Record<string, unknown> | unknown[]): boolean {
  return Array.isArray(value) ? value.length > 0 : Object.keys(value).length > 0
}
