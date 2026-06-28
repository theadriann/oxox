import { createHash } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { Readable } from 'node:stream'

export type TranscriptRecord = {
  byteLength: number
  byteOffset: number
  compactionSummaryId: string | null
  lineNo: number
  parentRecordId: string | null
  payload: Record<string, unknown>
  rawHash: string
  recordId: string | null
  timestamp: string | null
  type: string
}

export type TranscriptParseResult = {
  lastByteOffset: number
  records: TranscriptRecord[]
}

type ParseTranscriptFileOptions = {
  startLineNo?: number
  startOffset?: number
}

type CompleteLine = {
  bytes: Buffer
  byteLength: number
  byteOffset: number
  lineNo: number
}

export async function parseTranscriptFile(
  content: string,
  options: ParseTranscriptFileOptions = {},
): Promise<TranscriptParseResult> {
  return parseTranscriptReadable(Readable.from([Buffer.from(content, 'utf8')]), {
    startLineNo: options.startLineNo ?? 1,
    startOffset: options.startOffset ?? 0,
  })
}

export async function parseTranscriptFileFromPath(
  filePath: string,
  options: number | ParseTranscriptFileOptions = 0,
): Promise<TranscriptParseResult> {
  const startOffset = typeof options === 'number' ? options : (options.startOffset ?? 0)
  const startLineNo = typeof options === 'number' ? undefined : options.startLineNo
  const safeStartOffset = Math.max(0, startOffset)
  const stream = createReadStream(filePath, {
    start: safeStartOffset,
  })

  return parseTranscriptReadable(stream, {
    startLineNo: startLineNo ?? (await countLineNumberAtOffset(filePath, safeStartOffset)),
    startOffset: safeStartOffset,
  })
}

async function parseTranscriptReadable(
  readable: NodeJS.ReadableStream,
  options: Required<ParseTranscriptFileOptions>,
): Promise<TranscriptParseResult> {
  const records: TranscriptRecord[] = []
  const splitter = new CompleteJsonlLineSplitter(options)

  try {
    for await (const chunk of readable as AsyncIterable<Buffer | string>) {
      for (const line of splitter.pushChunk(chunk)) {
        const record = parseCompleteLine(line)

        if (record) {
          records.push(record)
        }
      }
    }
  } finally {
    readable.destroy()
  }

  const trailingRecord = parseTrailingLine(splitter.pendingLine)

  if (trailingRecord) {
    records.push(trailingRecord)
  }

  return {
    lastByteOffset: splitter.lastByteOffset + (trailingRecord ? splitter.pendingLineBytes : 0),
    records,
  }
}

function parseCompleteLine(line: CompleteLine): TranscriptRecord | null {
  const recordBytes = stripJsonlLineTerminator(line.bytes)

  if (recordBytes.toString('utf8').trim().length === 0) {
    return null
  }

  return normalizeTranscriptRecord(JSON.parse(recordBytes.toString('utf8')), line, recordBytes)
}

function parseTrailingLine(line: CompleteLine | null): TranscriptRecord | null {
  if (!line || line.bytes.toString('utf8').trim().length === 0) {
    return null
  }

  const recordBytes = line.bytes

  try {
    return normalizeTranscriptRecord(JSON.parse(recordBytes.toString('utf8')), line, recordBytes)
  } catch (error) {
    if (error instanceof SyntaxError) {
      return null
    }

    throw error
  }
}

function normalizeTranscriptRecord(
  value: unknown,
  source: CompleteLine,
  rawRecordBytes: Buffer,
): TranscriptRecord {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('expected transcript records to be JSON objects')
  }

  const parsed = value as Record<string, unknown>
  const type = typeof parsed.type === 'string' ? parsed.type : null

  if (!type) {
    throw new Error('transcript record is missing a string type field')
  }

  const timestamp = typeof parsed.timestamp === 'string' ? parsed.timestamp : null
  const payload = { ...parsed }
  delete payload.type
  delete payload.timestamp

  return {
    byteLength: source.byteLength,
    byteOffset: source.byteOffset,
    compactionSummaryId: firstString(
      payload.compactionSummaryId,
      payload.compaction_summary_id,
      isRecord(payload.summary) ? payload.summary.id : undefined,
    ),
    lineNo: source.lineNo,
    parentRecordId: firstString(payload.parentRecordId, payload.parent_id, payload.parent),
    payload,
    rawHash: createHash('sha256').update(rawRecordBytes).digest('hex'),
    recordId: firstString(payload.id, payload.recordId, payload.record_id),
    timestamp,
    type,
  }
}

class CompleteJsonlLineSplitter {
  private bufferedBytes = Buffer.alloc(0)
  private consumedByteCount = 0
  private consumedLineCount = 0

  constructor(private readonly options: Required<ParseTranscriptFileOptions>) {}

  get lastByteOffset(): number {
    return this.consumedByteCount
  }

  get pendingLine(): CompleteLine | null {
    if (this.bufferedBytes.length === 0) {
      return null
    }

    return {
      bytes: this.bufferedBytes,
      byteLength: this.bufferedBytes.length,
      byteOffset: this.options.startOffset + this.consumedByteCount,
      lineNo: this.options.startLineNo + this.consumedLineCount,
    }
  }

  get pendingLineBytes(): number {
    return this.bufferedBytes.length
  }

  pushChunk(chunk: Buffer | string): CompleteLine[] {
    const nextChunk = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
    const combined =
      this.bufferedBytes.length > 0 ? Buffer.concat([this.bufferedBytes, nextChunk]) : nextChunk
    const lines: CompleteLine[] = []
    let lineStart = 0

    for (let index = 0; index < combined.length; index += 1) {
      if (combined[index] !== 0x0a) {
        continue
      }

      const lineBytes = combined.subarray(lineStart, index + 1)
      lines.push({
        bytes: lineBytes,
        byteLength: lineBytes.length,
        byteOffset: this.options.startOffset + this.consumedByteCount,
        lineNo: this.options.startLineNo + this.consumedLineCount,
      })
      this.consumedByteCount += lineBytes.length
      this.consumedLineCount += 1
      lineStart = index + 1
    }

    this.bufferedBytes = combined.subarray(lineStart)

    return lines
  }
}

function stripJsonlLineTerminator(bytes: Buffer): Buffer {
  let end = bytes.length

  if (end > 0 && bytes[end - 1] === 0x0a) {
    end -= 1
  }

  if (end > 0 && bytes[end - 1] === 0x0d) {
    end -= 1
  }

  return bytes.subarray(0, end)
}

function firstString(...values: unknown[]): string | null {
  for (const value of values) {
    if (typeof value === 'string' && value.length > 0) {
      return value
    }
  }

  return null
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

async function countLineNumberAtOffset(filePath: string, offset: number): Promise<number> {
  if (offset <= 0) {
    return 1
  }

  let newlineCount = 0
  const stream = createReadStream(filePath, { end: offset - 1, start: 0 })

  try {
    for await (const chunk of stream as AsyncIterable<Buffer | string>) {
      const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)

      for (const byte of bytes) {
        if (byte === 0x0a) {
          newlineCount += 1
        }
      }
    }
  } finally {
    stream.destroy()
  }

  return newlineCount + 1
}
