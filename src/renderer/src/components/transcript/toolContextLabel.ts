/**
 * Extracts a short contextual label from a tool call's input JSON.
 * Used to display meaningful info in accordion titles (e.g. command, file path, skill name).
 */

export function getToolContextLabel(
  toolName: string,
  inputMarkdown: string | null,
): string | null {
  if (!inputMarkdown) return null

  const parsed = parseInputJson(inputMarkdown)
  if (!parsed) return null

  const lower = toolName.toLowerCase()

  // Execute / Example → show command
  if (lower === 'execute' || lower === 'example') {
    return strField(parsed, 'command')
  }

  // Skill → show skill name
  if (lower === 'skill') {
    return strField(parsed, 'skill')
  }

  // Edit / Read / Create → show file name
  if (lower === 'edit' || lower === 'read' || lower === 'create') {
    return mapStrField(parsed, 'file_path', extractFileName)
  }

  // Grep → show pattern + path hint
  if (lower === 'grep') {
    const pattern = strField(parsed, 'pattern')
    const path = mapStrField(parsed, 'path', extractFileName)
    return joinParts([pattern, path], ' in ')
  }

  // Glob → show patterns
  if (lower === 'glob') {
    const patterns = parsed['patterns']
    if (Array.isArray(patterns) && patterns.length > 0) {
      return String(patterns[0])
    }
    return null
  }

  // LS → show directory name
  if (lower === 'ls') {
    return mapStrField(parsed, 'directory_path', extractFileName)
  }

  // ApplyPatch → show first file name
  if (lower === 'applypatch') {
    const input = strField(parsed, 'input')
    if (input) {
      const match = input.match(/\*\*\* (?:Update|Add) File: (.+)/)
      if (match?.[1]) return extractFileName(match[1].trim())
    }
    return null
  }

  // FetchUrl → show url
  if (lower === 'fetchurl') {
    return strField(parsed, 'url')
  }

  // WebSearch → show query
  if (lower === 'websearch') {
    return strField(parsed, 'query')
  }

  // Task → show subagent type + description
  if (lower === 'task') {
    return joinParts([strField(parsed, 'subagent_type'), strField(parsed, 'description')], ': ')
  }

  // TaskOutput / TaskStop → show task_id
  if (lower === 'taskoutput' || lower === 'taskstop') {
    return strField(parsed, 'task_id')
  }

  // AskUser → show first question
  if (lower === 'askuser') {
    const questionnaire = strField(parsed, 'questionnaire')
    if (questionnaire) {
      const match = questionnaire.match(/\[question\]\s*(.+)/)
      if (match?.[1]) return match[1].trim()
    }
    return null
  }

  // getIdeDiagnostics → show file name
  if (lower === 'getidediagnostics') {
    const uri = strField(parsed, 'uri')
    if (uri) return extractFileName(uri.replace('file://', ''))
    return null
  }

  // ExitSpecMode → show title
  if (lower === 'exitspecmode') {
    return strField(parsed, 'title')
  }

  // executor___execute → show code snippet
  if (lower === 'executor___execute') {
    const code = strField(parsed, 'code')
    if (code) return code.split('\n')[0]?.trim() ?? null
    return null
  }

  // executor___resume → show executionId
  if (lower === 'executor___resume') {
    const payload = parsed['resumePayload']
    if (payload && typeof payload === 'object') {
      return strField(payload as Record<string, unknown>, 'executionId')
    }
    return null
  }

  // MCP / namespaced tools (e.g. kova___search_chunks, context7___query-docs)
  // Try to extract the most relevant human-readable fields
  return buildMcpFallbackLabel(parsed)
}

/**
 * For MCP / unknown namespaced tools, pick the most relevant string fields
 * to build a short contextual label.
 */
function buildMcpFallbackLabel(parsed: Record<string, unknown>): string | null {
  // Priority fields that are commonly useful for MCP tools
  const priorityKeys = [
    'query',
    'vault',
    'command',
    'url',
    'path',
    'file_path',
    'library',
    'service',
    'method',
    'action',
    'name',
    'description',
  ]

  const parts: string[] = []

  for (const key of priorityKeys) {
    const val = parsed[key]
    if (typeof val === 'string' && val.length > 0 && val.length < 200) {
      parts.push(val)
      if (parts.length >= 2) break
    }
  }

  if (parts.length === 0) {
    // Last resort: pick the first short string value
    for (const val of Object.values(parsed)) {
      if (typeof val === 'string' && val.length > 0 && val.length < 100) {
        parts.push(val)
        break
      }
    }
  }

  return parts.length > 0 ? parts.join(' · ') : null
}

function strField(obj: Record<string, unknown>, key: string): string | null {
  const val = obj[key]
  return typeof val === 'string' && val.length > 0 ? val : null
}

function mapStrField(
  obj: Record<string, unknown>,
  key: string,
  fn: (val: string) => string,
): string | null {
  const val = strField(obj, key)
  return val ? fn(val) : null
}

function joinParts(parts: (string | null)[], separator: string): string | null {
  const filtered = parts.filter((p): p is string => p !== null)
  return filtered.length > 0 ? filtered.join(separator) : null
}

function parseInputJson(inputMarkdown: string): Record<string, unknown> | null {
  const trimmed = inputMarkdown.trim()

  // Try fenced JSON block first
  const fencedMatch = trimmed.match(/^```(?:json)?\n([\s\S]*?)\n```$/)
  const jsonText = fencedMatch ? fencedMatch[1] : trimmed

  try {
    const parsed = JSON.parse(jsonText)
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null
  } catch {
    return null
  }
}

function extractFileName(path: string): string {
  const segments = path.replace('file://', '').split('/')
  return segments.at(-1) ?? path
}
