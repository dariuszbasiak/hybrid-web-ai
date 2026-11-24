import { MODEL_TOOLS, formatToolResultsFallback } from "@/services/aiTools"
import { streamCloudFallback } from "@/services/fallbackService"
import type {
  ActiveToolCall,
  ChatMessage,
  FallbackState,
  LanguageModelMessageContent,
  LanguageModelPromptMessage,
  LanguageModelSession,
  LanguageModelStreamChunk,
  LanguageModelToolSuccessInit,
  MessageSource,
  TokenUsage,
} from "@/types/chat"

export interface TokenUsageDelta {
  local?: number
  cloud?: TokenUsage
}

export interface PromptExecutionResult {
  text: string
  source: MessageSource
  model?: string
  fallbackReason?: string
}

const MAX_TOOL_ROUNDS = 5

interface ParsedToolCall {
  callId?: string
  name: string
  arguments: Record<string, unknown>
}

interface StreamConsumptionResult {
  text: string
  toolCalls: ParsedToolCall[]
}

export function isLanguageModelAvailable(): boolean {
  return typeof LanguageModel !== "undefined"
}

export async function createChatSession(
  history: Pick<ChatMessage, "role" | "content">[] = []
): Promise<LanguageModelSession> {
  if (!LanguageModel) {
    throw new Error("LanguageModel API is not available in this browser.")
  }

  const historyPrompts = history
    .filter((msg) => msg.content.trim().length > 0)
    .map((msg) => ({
      role: msg.role,
      content: msg.content,
    }))

  return LanguageModel.create({
    initialPrompts: [
      {
        role: "system",
        content: [
          `Today's date is ${new Date().toISOString().slice(0, 10)}.`,
          "You are a lightweight local assistant with NO internet access, NO web search, and NO access to external documents or institutional reports.",
          "Your task is to answer user questions based on the provided tools and information.",
          "You should depend on own capabilites when user ask for day to day task",
          "Escalete query only if user ask it directly or you are totally not sure how to handle",
          "Available tools:",
          "- resolve_date_range: ALWAYS call this first when the user asks about a relative date ('today', 'yesterday', 'tomorrow', 'this week', 'next week'), then pass the returned startDate and endDate to check_callendar.",
          "- check_callendar: use when the user asks about calendar events for a date range. After receiving tool results, summarize them clearly to answer the user's question.",
          "- too_complex: ALWAYS call this tool immediately—without answering, offering an outline, or asking clarifying questions—whenever the user asks for web search, external research, reports across organizations/institutions, live data, or complex multi-step tasks.",
        ].join("\n"),
      },
      ...historyPrompts,
    ],
    tools: MODEL_TOOLS,
    expectedInputs: [
      { type: "text", languages: ["en"] },
      { type: "tool-response" },
    ],
    expectedOutputs: [
      { type: "text", languages: ["en"] },
      { type: "tool-call" },
    ],
  })
}

function parseToolArguments(raw: unknown): Record<string, unknown> {
  if (!raw) return {}
  if (typeof raw === "string") {
    try {
      const parsed: unknown = JSON.parse(raw)
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>
      }
      return {}
    } catch {
      return {}
    }
  }
  if (typeof raw === "object" && !Array.isArray(raw)) {
    return raw as Record<string, unknown>
  }
  return {}
}

function appendContentItem(
  item: LanguageModelMessageContent,
  state: { text: string; toolCalls: ParsedToolCall[] },
  onStreamUpdate?: (textSoFar: string) => void
): void {
  if ("type" in item && item.type === "text") {
    if (item.value) {
      state.text += item.value
      onStreamUpdate?.(state.text)
    }
    return
  }

  if ("type" in item && item.type === "tool-call") {
    const name = item.value?.name ?? item.name
    if (!name) return
    state.toolCalls.push({
      callId:
        item.value?.callId ??
        item.value?.callID ??
        item.callId ??
        item.callID,
      name,
      arguments: parseToolArguments(
        item.value?.arguments ??
        item.value?.input ??
        item.arguments ??
        item.input
      ),
    })
    return
  }

  if ("name" in item && typeof item.name === "string" && item.name) {
    state.toolCalls.push({
      callId: item.callId ?? item.callID,
      name: item.name,
      arguments: parseToolArguments(item.arguments ?? item.input),
    })
  }
}

function parseRawPromptResult(
  rawResult: string | LanguageModelMessageContent[],
  onStreamUpdate?: (textSoFar: string) => void
): StreamConsumptionResult {
  if (typeof rawResult === "string") {
    if (rawResult) {
      onStreamUpdate?.(rawResult)
    }
    return { text: rawResult, toolCalls: [] }
  }

  if (!Array.isArray(rawResult)) {
    return { text: "", toolCalls: [] }
  }

  const state: StreamConsumptionResult = { text: "", toolCalls: [] }
  for (const item of rawResult) {
    if (item && typeof item === "object") {
      appendContentItem(item, state, onStreamUpdate)
    }
  }
  return state
}

async function consumePromptStream(
  stream: ReadableStream<LanguageModelStreamChunk>,
  onStreamUpdate?: (textSoFar: string) => void
): Promise<StreamConsumptionResult> {
  const reader = stream.getReader()
  const state: StreamConsumptionResult = { text: "", toolCalls: [] }

  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      console.debug("[PromptAPI] Stream chunk:", value)

      if (typeof value === "string") {
        if (value) {
          state.text += value
          onStreamUpdate?.(state.text)
        }
      } else if (Array.isArray(value)) {
        for (const item of value) {
          if (item && typeof item === "object") {
            appendContentItem(item, state, onStreamUpdate)
          }
        }
      } else if (value && typeof value === "object") {
        appendContentItem(value, state, onStreamUpdate)
      }
    }
  } finally {
    reader.releaseLock()
  }

  return state
}

async function promptStreamOnce(
  session: LanguageModelSession,
  input: string | LanguageModelPromptMessage[],
  signal: AbortSignal,
  onStreamUpdate?: (textSoFar: string) => void
): Promise<StreamConsumptionResult> {
  const stream = session.promptStreaming(input, { signal })
  const streamed = await consumePromptStream(stream, onStreamUpdate)

  if (streamed.text.trim() === "" && streamed.toolCalls.length === 0) {
    console.debug(
      "[PromptAPI] Stream closed empty; falling back to session.prompt()"
    )
    const rawResult = await session.prompt(input, { signal })
    return parseRawPromptResult(rawResult, onStreamUpdate)
  }

  return streamed
}

async function syncCloudReplyToLocalSession(
  session: LanguageModelSession,
  escalationCall: ParsedToolCall,
  userPrompt: string,
  cloudReply: string,
  priorHistory: ChatMessage[],
  signal: AbortSignal,
  onSessionReplaced?: (nextSession: LanguageModelSession) => void
): Promise<void> {
  if (!cloudReply.trim() || signal.aborted) return

  const payload: LanguageModelToolSuccessInit = {
    callID: escalationCall.callId,
    callId: escalationCall.callId,
    name: escalationCall.name,
    result: [
      {
        type: "text",
        value: JSON.stringify({
          handledByCloud: true,
          response: cloudReply,
        }),
      },
    ],
  }

  const toolResponseMessage: LanguageModelPromptMessage = {
    role: "user",
    content: [
      {
        type: "tool-response",
        value:
          typeof LanguageModelToolSuccess !== "undefined"
            ? new LanguageModelToolSuccess(payload)
            : payload,
      },
    ],
  }

  if (typeof session.append === "function") {
    try {
      await session.append(
        [
          toolResponseMessage,
          { role: "assistant", content: cloudReply },
        ],
        { signal }
      )
      console.debug("[PromptAPI] Synced cloud fallback reply via session.append()")
      return
    } catch (err) {
      console.warn(
        "[PromptAPI] session.append() failed after cloud fallback; recreating local session with history:",
        err
      )
    }
  }

  if (!onSessionReplaced) return

  const updatedHistory: Pick<ChatMessage, "role" | "content">[] = [
    ...priorHistory.map(({ role, content }) => ({ role, content })),
    { role: "user", content: userPrompt },
    { role: "assistant", content: cloudReply },
  ]

  try {
    const nextSession = await createChatSession(updatedHistory)
    if (signal.aborted) {
      nextSession.destroy?.()
      return
    }
    session.destroy?.()
    onSessionReplaced(nextSession)
    console.debug(
      "[PromptAPI] Recreated local session with cloud fallback reply in history"
    )
  } catch (err) {
    console.warn(
      "[PromptAPI] Failed to recreate local session with cloud fallback reply:",
      err
    )
  }
}

function getSessionTokenUsage(session: LanguageModelSession): number | null {
  if (
    typeof session.inputUsage === "number" &&
    Number.isFinite(session.inputUsage)
  ) {
    return session.inputUsage
  }
  if (
    typeof session.tokensSoFar === "number" &&
    Number.isFinite(session.tokensSoFar)
  ) {
    return session.tokensSoFar
  }
  return null
}

function estimateTokens(text: string): number {
  const trimmed = text.trim()
  if (!trimmed) return 0
  return Math.max(1, Math.ceil(trimmed.length / 4))
}

export async function runPromptWithToolLoop(
  session: LanguageModelSession,
  initialInput: string,
  signal: AbortSignal,
  onStreamUpdate?: (textSoFar: string) => void,
  onToolCall?: (toolCalls: ActiveToolCall[]) => void,
  options?: {
    history?: ChatMessage[]
    onFallbackStart?: (state: FallbackState) => void
    onSessionReplaced?: (nextSession: LanguageModelSession) => void
    onTokenUsage?: (delta: TokenUsageDelta) => void
  }
): Promise<PromptExecutionResult> {
  const localUsageBefore = getSessionTokenUsage(session)
  let localUsageReported = false

  const reportLocalUsage = (localOutputText: string) => {
    if (localUsageReported) return
    localUsageReported = true
    const localUsageAfter = getSessionTokenUsage(session)
    const measuredDelta =
      localUsageBefore !== null &&
      localUsageAfter !== null &&
      localUsageAfter > localUsageBefore
        ? localUsageAfter - localUsageBefore
        : estimateTokens(initialInput) + estimateTokens(localOutputText)

    if (measuredDelta > 0) {
      options?.onTokenUsage?.({ local: measuredDelta })
    }
  }

  console.debug("[PromptAPI] Streaming initial prompt:", initialInput)
  let stepResult = await promptStreamOnce(
    session,
    initialInput,
    signal,
    onStreamUpdate
  )
  let lastToolResults: Array<ParsedToolCall & { result: string }> = []

  const runPlainTextFallback = async (
    toolResults: Array<ParsedToolCall & { result: string }>
  ): Promise<StreamConsumptionResult> => {
    const contextPrompt = toolResults
      .map((r) => `Tool "${r.name}" result:\n${r.result}`)
      .join("\n\n")
    return promptStreamOnce(
      session,
      `${contextPrompt}\n\nUsing these tool results, answer the user's question directly.`,
      signal,
      onStreamUpdate
    )
  }

  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    if (stepResult.toolCalls.length === 0) {
      if (stepResult.text.trim() === "" && lastToolResults.length > 0) {
        const fallback = formatToolResultsFallback(lastToolResults)
        onStreamUpdate?.(fallback)
        reportLocalUsage(fallback)
        return { text: fallback, source: "local" }
      }
      reportLocalUsage(stepResult.text)
      return { text: stepResult.text, source: "local" }
    }

    const escalationCall = stepResult.toolCalls.find(
      (call) => call.name === "too_complex"
    )
    if (escalationCall) {
      const reason =
        typeof escalationCall.arguments.reason === "string"
          ? escalationCall.arguments.reason
          : undefined
      reportLocalUsage(JSON.stringify(escalationCall.arguments))
      console.debug("[PromptAPI] Escalating to cloud fallback:", reason)
      onToolCall?.([])
      options?.onFallbackStart?.({ reason })

      const toolContext =
        lastToolResults.length > 0
          ? lastToolResults
            .map((r) => `Tool "${r.name}" result:\n${r.result}`)
            .join("\n\n")
          : undefined

      const cloudResult = await streamCloudFallback({
        prompt: initialInput,
        history: options?.history,
        reason,
        toolContext,
        signal,
        onMeta: (meta) => {
          options?.onFallbackStart?.({ reason, model: meta.model })
        },
        onStreamUpdate,
        onUsage: (usage) => {
          options?.onTokenUsage?.({ cloud: usage })
        },
      })

      await syncCloudReplyToLocalSession(
        session,
        escalationCall,
        initialInput,
        cloudResult.text,
        options?.history ?? [],
        signal,
        options?.onSessionReplaced
      )

      return {
        text: cloudResult.text,
        source: "cloud",
        model: cloudResult.model,
        fallbackReason: reason,
      }
    }

    console.debug("[PromptAPI] Executing tool calls:", stepResult.toolCalls)
    onToolCall?.(
      stepResult.toolCalls.map(({ name, arguments: args }) => ({
        name,
        arguments: args,
      }))
    )
    const toolResults = await Promise.all(
      stepResult.toolCalls.map(async (call) => {
        const tool = MODEL_TOOLS.find((t) => t.name === call.name)
        const result = tool
          ? await tool.execute(call.arguments)
          : JSON.stringify({ error: `Unknown tool: ${call.name}` })
        return { ...call, result }
      })
    )
    lastToolResults = toolResults

    try {
      console.debug("[PromptAPI] Streaming tool-response to session")
      stepResult = await promptStreamOnce(
        session,
        [
          {
            role: "user",
            content: toolResults.map((r) => {
              const payload: LanguageModelToolSuccessInit = {
                callID: r.callId,
                callId: r.callId,
                name: r.name,
                result: [{ type: "text", value: r.result }],
              }
              return {
                type: "tool-response" as const,
                value:
                  typeof LanguageModelToolSuccess !== "undefined"
                    ? new LanguageModelToolSuccess(payload)
                    : payload,
              }
            }),
          },
        ],
        signal,
        onStreamUpdate
      )

      if (stepResult.text.trim() === "" && stepResult.toolCalls.length === 0) {
        console.warn(
          "[PromptAPI] tool-response produced empty output, retrying with plain text context"
        )
        stepResult = await runPlainTextFallback(toolResults)
      }
    } catch (toolResponseErr) {
      console.warn(
        "[PromptAPI] tool-response stream failed, retrying with plain text context:",
        toolResponseErr
      )
      try {
        stepResult = await runPlainTextFallback(toolResults)
      } catch (fallbackErr) {
        console.warn(
          "[PromptAPI] Follow-up stream failed, returning formatted tool output:",
          fallbackErr
        )
        const fallback = formatToolResultsFallback(toolResults)
        onStreamUpdate?.(fallback)
        reportLocalUsage(fallback)
        return { text: fallback, source: "local" }
      }
    }
  }

  if (stepResult.text.trim() === "" && lastToolResults.length > 0) {
    const fallback = formatToolResultsFallback(lastToolResults)
    onStreamUpdate?.(fallback)
    reportLocalUsage(fallback)
    return { text: fallback, source: "local" }
  }

  reportLocalUsage(stepResult.text)
  return { text: stepResult.text, source: "local" }
}
