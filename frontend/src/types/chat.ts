export type MessageSource = "local" | "cloud"
export type HeaderVibeState = "idle" | "local" | "cloud"

export interface ChatMessage {
  id: string
  role: "user" | "assistant"
  content: string
  source?: MessageSource
  model?: string
  fallbackReason?: string
}

export interface FallbackState {
  reason?: string
  model?: string
}

export interface TokenUsage {
  inputTokens: number
  outputTokens: number
  totalTokens: number
}

export interface TokenUsageSummary {
  local: number
  cloud: number
  cloudInput: number
  cloudOutput: number
}

export interface ActiveToolCall {
  name: string
  arguments: Record<string, unknown>
}

export interface CalendarEvent {
  id: string
  date: string
  weekDay: string
  startTime: string
  endTime: string
  title: string
  location?: string
}

export interface LanguageModelTool<TArgs = Record<string, unknown>> {
  name: string
  description: string
  inputSchema: {
    type: "object"
    properties: Record<
      string,
      {
        type: string
        description?: string
        enum?: string[]
      }
    >
    required?: string[]
  }
  execute: (args: TArgs) => Promise<string> | string
}

export interface LanguageModelExpectedIO {
  type: "text" | "tool-call" | "tool-response" | "image" | "audio"
  languages?: string[]
}

export interface LanguageModelInitialPrompt {
  role: "system" | "user" | "assistant"
  content: string
}

export interface LanguageModelCreateOptions {
  initialPrompts?: LanguageModelInitialPrompt[]
  tools?: LanguageModelTool<any>[]
  expectedInputs?: LanguageModelExpectedIO[]
  expectedOutputs?: LanguageModelExpectedIO[]
}

export type LanguageModelToolCallPayload = {
  callId?: string
  callID?: string
  name: string
  arguments?: Record<string, unknown> | string
  input?: Record<string, unknown> | string
}

export type LanguageModelToolCallItem = {
  type: "tool-call"
  callId?: string
  callID?: string
  name?: string
  arguments?: Record<string, unknown> | string
  input?: Record<string, unknown> | string
  value?: LanguageModelToolCallPayload
}

export type LanguageModelMessageContent =
  | { type: "text"; value: string }
  | LanguageModelToolCallItem
  | LanguageModelToolCallPayload

export interface LanguageModelToolSuccessInit {
  callID?: string
  callId?: string
  name: string
  result: Array<{ type: "text"; value: string }>
}

export interface LanguageModelToolResponseContent {
  type: "tool-response"
  value: unknown
}

export interface LanguageModelPromptMessage {
  role: "system" | "user" | "assistant"
  content: string | LanguageModelToolResponseContent[]
}

export type LanguageModelStreamChunk =
  | string
  | LanguageModelMessageContent
  | LanguageModelMessageContent[]

export interface LanguageModelSession {
  inputUsage?: number
  tokensSoFar?: number
  prompt(
    input: string | LanguageModelPromptMessage[],
    options?: { signal?: AbortSignal }
  ): Promise<string | LanguageModelMessageContent[]>
  promptStreaming(
    input: string | LanguageModelPromptMessage[],
    options?: { signal?: AbortSignal }
  ): ReadableStream<LanguageModelStreamChunk>
  append?(
    input: string | LanguageModelPromptMessage[],
    options?: { signal?: AbortSignal }
  ): Promise<void>
  destroy?(): void
}

declare global {
  const LanguageModelToolSuccess:
    | (new (init: LanguageModelToolSuccessInit) => unknown)
    | undefined

  const LanguageModel:
    | {
        create(options?: LanguageModelCreateOptions): Promise<LanguageModelSession>
      }
    | undefined
}
