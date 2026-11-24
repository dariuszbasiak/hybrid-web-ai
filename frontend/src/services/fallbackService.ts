import type { ChatMessage, TokenUsage } from "@/types/chat"

export interface CloudFallbackMeta {
  provider: string
  model: string
}

export interface CloudFallbackOptions {
  prompt: string
  history?: ChatMessage[]
  reason?: string
  toolContext?: string
  signal?: AbortSignal
  onMeta?: (meta: CloudFallbackMeta) => void
  onStreamUpdate?: (textSoFar: string) => void
  onUsage?: (usage: TokenUsage) => void
}

export interface CloudFallbackResult {
  text: string
  model?: string
  provider?: string
  usage?: TokenUsage
}

interface ParsedSseEvent {
  event: string
  data: string
}

function parseSseBlock(block: string): ParsedSseEvent | null {
  const lines = block.split(/\r?\n/)
  let event = "message"
  const dataLines: string[] = []

  for (const line of lines) {
    if (!line || line.startsWith(":")) continue
    if (line.startsWith("event:")) {
      event = line.slice(6).trim()
    } else if (line.startsWith("data:")) {
      dataLines.push(line.slice(5).trimStart())
    }
  }

  if (dataLines.length === 0) return null
  return { event, data: dataLines.join("\n") }
}

export async function streamCloudFallback(
  options: CloudFallbackOptions
): Promise<CloudFallbackResult> {
  const {
    prompt,
    history = [],
    reason,
    toolContext,
    signal,
    onMeta,
    onStreamUpdate,
    onUsage,
  } = options

  const response = await fetch("/api/fallback/chat", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "text/event-stream",
    },
    body: JSON.stringify({
      prompt,
      history: history.map(({ role, content }) => ({ role, content })),
      reason,
      toolContext,
    }),
    signal,
  })

  if (!response.ok) {
    let detail = `Cloud fallback error: ${response.status} ${response.statusText}`
    try {
      const errorJson = (await response.json()) as { detail?: string }
      if (typeof errorJson.detail === "string" && errorJson.detail.trim()) {
        detail = errorJson.detail
      }
    } catch {
      // Ignore non-JSON error body
    }
    throw new Error(detail)
  }

  if (!response.body) {
    throw new Error("Cloud fallback returned an empty response stream.")
  }

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ""
  let fullText = ""
  let model: string | undefined
  let provider: string | undefined
  let usage: TokenUsage | undefined

  const handleEvent = (parsed: ParsedSseEvent) => {
    let payload: Record<string, unknown> = {}
    try {
      payload = JSON.parse(parsed.data) as Record<string, unknown>
    } catch {
      return
    }

    if (parsed.event === "meta") {
      model = typeof payload.model === "string" ? payload.model : undefined
      provider =
        typeof payload.provider === "string" ? payload.provider : undefined
      if (model && provider) {
        onMeta?.({ model, provider })
      }
      return
    }

    if (parsed.event === "delta") {
      const chunk = typeof payload.text === "string" ? payload.text : ""
      if (chunk) {
        fullText += chunk
        onStreamUpdate?.(fullText)
      }
      return
    }

    if (parsed.event === "usage") {
      const inputTokens =
        typeof payload.inputTokens === "number" ? payload.inputTokens : 0
      const outputTokens =
        typeof payload.outputTokens === "number" ? payload.outputTokens : 0
      const totalTokens =
        typeof payload.totalTokens === "number"
          ? payload.totalTokens
          : inputTokens + outputTokens
      usage = { inputTokens, outputTokens, totalTokens }
      onUsage?.(usage)
      return
    }

    if (parsed.event === "error") {
      const message =
        typeof payload.message === "string"
          ? payload.message
          : "Cloud fallback failed during generation."
      throw new Error(message)
    }
  }

  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      buffer += decoder.decode(value, { stream: true })
      const blocks = buffer.split(/\r?\n\r?\n/)
      buffer = blocks.pop() ?? ""

      for (const block of blocks) {
        const parsed = parseSseBlock(block)
        if (parsed) {
          handleEvent(parsed)
        }
      }
    }

    buffer += decoder.decode()
    if (buffer.trim()) {
      const parsed = parseSseBlock(buffer)
      if (parsed) {
        handleEvent(parsed)
      }
    }
  } finally {
    reader.releaseLock()
  }

  return { text: fullText, model, provider, usage }
}
