import type {
  LiveSessionAskUserAnswerRecord,
  LiveSessionAskUserQuestionRecord,
  TranscriptMessageContentBlock,
} from '../../../../shared/ipc/contracts'

export type MessageRole = 'assistant' | 'system' | 'user'
export type MessageStatus = 'completed' | 'streaming'
export type ToolStatus = 'completed' | 'failed' | 'running'
export type RiskLevel = 'low' | 'medium' | 'high' | 'unknown'
export type EventTone = 'default' | 'danger' | 'success' | 'warning'

export interface MessageTimelineItem {
  kind: 'message'
  id: string
  messageId: string
  role: MessageRole
  content: string
  status: MessageStatus
  occurredAt: string | null
  contentBlocks?: TranscriptMessageContentBlock[]
}

export interface ThinkingTimelineItem {
  kind: 'thinking'
  id: string
  messageId: string
  content: string
  status: 'streaming' | 'completed'
}

export interface ToolTimelineItem {
  kind: 'tool'
  id: string
  toolUseId: string
  toolName: string
  status: ToolStatus
  occurredAt: string | null
  inputMarkdown: string | null
  resultMarkdown: string | null
  resultIsError: boolean
  progressHistory: string[]
  progressSummary: string | null
}

export interface PermissionTimelineItem {
  kind: 'permission'
  id: string
  requestId: string
  description: string
  riskLevel: RiskLevel
  options: string[]
  toolUseIds: string[]
  selectedOption: string | null
}

export interface AskUserTimelineItem {
  kind: 'askUser'
  id: string
  requestId: string
  prompt: string
  options: string[]
  questions: LiveSessionAskUserQuestionRecord[]
  submittedAnswers: LiveSessionAskUserAnswerRecord[] | null
}

export interface SystemEventTimelineItem {
  kind: 'event'
  id: string
  title: string
  body: string
  typeLabel: string
  tone: EventTone
  details: string[]
}

export type TimelineItem =
  | MessageTimelineItem
  | ThinkingTimelineItem
  | ToolTimelineItem
  | PermissionTimelineItem
  | AskUserTimelineItem
  | SystemEventTimelineItem
