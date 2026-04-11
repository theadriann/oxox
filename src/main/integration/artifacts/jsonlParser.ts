import { createReadStream } from 'node:fs'
import { Readable, Transform } from 'node:stream'

import jsonlParser from 'stream-json/jsonl/parser.js'

export type TranscriptRecord = {
  payload: Record<string, unknown>
  timestamp: string | null
  type: string
}

export type TranscriptParseResult = {
  lastByteOffset: number
  records: TranscriptRecord[]
}

type JsonlItem = {
  key: number
  value: unknown
}

export async function parseTranscriptFile(content: string): Promise<TranscriptParseResult> {
  return parseTranscriptReadable(Readable.from([Buffer.from(content, 'utf8')]))
}

export async function parseTranscriptFileFromPath(
  filePath: string,
  startOffset = 0,
): Promise<TranscriptParseResult> {
  const stream = createReadStream(filePath, {
    start: Math.max(0, startOffset),
  })

  return parseTranscriptReadable(stream)
}

async function parseTranscriptReadable(
  readable: NodeJS.ReadableStream,
): Promise<TranscriptParseResult> {
  const records: TranscriptRecord[] = []
  const splitter = new CompleteJsonlLineSplitter()
  const parser = jsonlParser.asStream()
  const pipeline = readable.pipe(splitter).pipe(parser)

  try {
    for await (const item of pipeline as AsyncIterable<JsonlItem>) {
      records.push(normalizeTranscriptRecord(item.value))
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

function parseTrailingLine(line: string | null): TranscriptRecord | null {
  if (!line || line.trim().length === 0) {
    return null
  }

  try {
    return normalizeTranscriptRecord(JSON.parse(line))
  } catch (error) {
    if (error instanceof SyntaxError) {
      return null
    }

    throw error
  }
}

function normalizeTranscriptRecord(value: unknown): TranscriptRecord {
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

  return { type, timestamp, payload }
}

class CompleteJsonlLineSplitter extends Transform {
  private bufferedBytes = Buffer.alloc(0)
  private consumedByteCount = 0

  get lastByteOffset(): number {
    return this.consumedByteCount
  }

  get pendingLine(): string | null {
    return this.bufferedBytes.length > 0 ? this.bufferedBytes.toString('utf8') : null
  }

  get pendingLineBytes(): number {
    return this.bufferedBytes.length
  }

  override _transform(
    chunk: Buffer | string,
    _encoding: BufferEncoding,
    callback: (error?: Error | null) => void,
  ): void {
    const nextChunk = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
    const combined =
      this.bufferedBytes.length > 0 ? Buffer.concat([this.bufferedBytes, nextChunk]) : nextChunk
    const lastNewlineIndex = combined.lastIndexOf(0x0a)

    if (lastNewlineIndex < 0) {
      this.bufferedBytes = combined
      callback()
      return
    }

    const complete = combined.subarray(0, lastNewlineIndex + 1)
    this.bufferedBytes = combined.subarray(lastNewlineIndex + 1)
    this.consumedByteCount += complete.length
    this.push(complete)
    callback()
  }
}
