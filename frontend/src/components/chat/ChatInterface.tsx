import { useEffect, useRef, useState } from "react"

import { ChatHeader } from "@/components/chat/ChatHeader"
import { ChatInputBar } from "@/components/chat/ChatInputBar"
import { ChatMessageList } from "@/components/chat/ChatMessageList"
import { streamCloudFallback } from "@/services/fallbackService"
import {
  createChatSession,
  isLanguageModelAvailable,
  runPromptWithToolLoop,
  type TokenUsageDelta,
} from "@/services/languageModelService"
import type {
  ActiveToolCall,
  ChatMessage,
  FallbackState,
  HeaderVibeState,
  LanguageModelSession,
  TokenUsageSummary,
} from "@/types/chat"

const INITIAL_TOKEN_USAGE: TokenUsageSummary = {
  local: 0,
  cloud: 0,
  cloudInput: 0,
  cloudOutput: 0,
}

export type { ChatMessage } from "@/types/chat"

export function ChatInterface() {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState("")
  const [isGenerating, setIsGenerating] = useState(false)
  const [activeToolCalls, setActiveToolCalls] = useState<ActiveToolCall[]>([])
  const [fallbackState, setFallbackState] = useState<FallbackState | null>(null)
  const [tokenUsage, setTokenUsage] =
    useState<TokenUsageSummary>(INITIAL_TOKEN_USAGE)
  const abortControllerRef = useRef<AbortController | null>(null)

  const handleTokenUsage = (delta: TokenUsageDelta) => {
    setTokenUsage((prev) => ({
      local: prev.local + (delta.local ?? 0),
      cloud: prev.cloud + (delta.cloud?.totalTokens ?? 0),
      cloudInput: prev.cloudInput + (delta.cloud?.inputTokens ?? 0),
      cloudOutput: prev.cloudOutput + (delta.cloud?.outputTokens ?? 0),
    }))
  }
  const sessionRef = useRef<LanguageModelSession | null>(null)
  const [session, setSession] = useState<LanguageModelSession | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [statusMessage, setStatusMessage] = useState<string | null>(
    "Loading model..."
  )

  const updateSession = (nextSession: LanguageModelSession | null) => {
    sessionRef.current = nextSession
    setSession(nextSession)
  }

  useEffect(() => {
    let cancelled = false

    const initSession = async () => {
      if (!isLanguageModelAvailable()) {
        if (!cancelled) {
          setError(null)
          setStatusMessage("Local model unavailable — using cloud fallback")
        }
        return
      }

      try {
        const createdSession = await createChatSession()
        if (cancelled) {
          createdSession.destroy?.()
          return
        }
        updateSession(createdSession)
        setStatusMessage("Local model ready")
        setError(null)
      } catch (err) {
        if (!cancelled) {
          console.error(err)
          setError(null)
          setStatusMessage("Local model unavailable — using cloud fallback")
        }
      }
    }

    void initSession()

    return () => {
      cancelled = true
      abortControllerRef.current?.abort()
      sessionRef.current?.destroy?.()
      sessionRef.current = null
    }
  }, [])

  const stopGeneration = () => {
    abortControllerRef.current?.abort()
    abortControllerRef.current = null
    setActiveToolCalls([])
    setFallbackState(null)
    setIsGenerating(false)
  }

  const sendMessage = async (text: string) => {
    const trimmed = text.trim()
    if (!trimmed || isGenerating) return

    const historySnapshot = messages
    const userMessage: ChatMessage = {
      id: crypto.randomUUID(),
      role: "user",
      content: trimmed,
    }

    setMessages((prev) => [...prev, userMessage])
    setInput("")
    setActiveToolCalls([])
    setFallbackState(null)
    setIsGenerating(true)
    setError(null)

    const controller = new AbortController()
    abortControllerRef.current = controller
    const assistantMessageId = crypto.randomUUID()
    let assistantMeta: Pick<
      ChatMessage,
      "source" | "model" | "fallbackReason"
    > = {
      source: session ? "local" : "cloud",
    }

    const upsertAssistantMessage = (
      content: string,
      metaOverride?: Partial<
        Pick<ChatMessage, "source" | "model" | "fallbackReason">
      >
    ) => {
      if (metaOverride) {
        assistantMeta = { ...assistantMeta, ...metaOverride }
      }
      const nextMeta = { ...assistantMeta }

      setMessages((prev) => {
        const exists = prev.some((m) => m.id === assistantMessageId)
        if (exists) {
          return prev.map((m) =>
            m.id === assistantMessageId ? { ...m, content, ...nextMeta } : m
          )
        }
        if (!content) {
          return prev
        }
        return [
          ...prev,
          { id: assistantMessageId, role: "assistant", content, ...nextMeta },
        ]
      })
    }

    const handleFallbackStart = (state: FallbackState) => {
      setActiveToolCalls([])
      setFallbackState(state)
      assistantMeta = {
        source: "cloud",
        model: state.model ?? assistantMeta.model,
        fallbackReason: state.reason ?? assistantMeta.fallbackReason,
      }
    }

    try {
      const result = session
        ? await runPromptWithToolLoop(
            session,
            trimmed,
            controller.signal,
            (content) => upsertAssistantMessage(content),
            setActiveToolCalls,
            {
              history: historySnapshot,
              onFallbackStart: handleFallbackStart,
              onSessionReplaced: updateSession,
              onTokenUsage: handleTokenUsage,
            }
          )
        : await (async () => {
            const reason = "Local Prompt API unavailable"
            handleFallbackStart({ reason })
            const cloudResult = await streamCloudFallback({
              prompt: trimmed,
              history: historySnapshot,
              reason,
              signal: controller.signal,
              onMeta: (meta) =>
                handleFallbackStart({ reason, model: meta.model }),
              onStreamUpdate: (content) => upsertAssistantMessage(content),
              onUsage: (usage) => handleTokenUsage({ cloud: usage }),
            })
            return {
              text: cloudResult.text,
              source: "cloud" as const,
              model: cloudResult.model,
              fallbackReason: reason,
            }
          })()

      if (!controller.signal.aborted) {
        upsertAssistantMessage(
          result.text.trim() ? result.text : "(No response generated)",
          {
            source: result.source,
            model: result.model,
            fallbackReason: result.fallbackReason,
          }
        )
      }
    } catch (err) {
      if (!controller.signal.aborted) {
        console.error(err)
        setError(
          err instanceof Error ? err.message : "Failed to generate response."
        )
      }
    } finally {
      if (abortControllerRef.current === controller) {
        abortControllerRef.current = null
      }
      setActiveToolCalls([])
      setFallbackState(null)
      setIsGenerating(false)
    }
  }

  const handleNewChat = () => {
    stopGeneration()
    setMessages([])
    setInput("")
    setError(null)
    setTokenUsage(INITIAL_TOKEN_USAGE)

    if (sessionRef.current) {
      sessionRef.current.destroy?.()
      updateSession(null)
      if (isLanguageModelAvailable()) {
        void createChatSession()
          .then((freshSession) => {
            updateSession(freshSession)
          })
          .catch((err) => {
            console.error(err)
            setStatusMessage("Local model unavailable — using cloud fallback")
          })
      }
    }
  }

  const vibeState: HeaderVibeState = !isGenerating
    ? "idle"
    : fallbackState || !session
      ? "cloud"
      : "local"

  return (
    <div className="bg-background text-foreground flex h-dvh flex-col">
      <ChatHeader
        onNewChat={handleNewChat}
        canReset={messages.length > 0 || isGenerating}
        error={error}
        statusMessage={statusMessage}
        vibeState={vibeState}
        tokenUsage={tokenUsage}
      />
      <ChatMessageList
        messages={messages}
        isGenerating={isGenerating}
        activeToolCalls={activeToolCalls}
        fallbackState={fallbackState}
        onSelectPrompt={(prompt) => void sendMessage(prompt)}
      />
      <ChatInputBar
        input={input}
        isGenerating={isGenerating}
        onInputChange={setInput}
        onSend={() => void sendMessage(input)}
        onStop={stopGeneration}
      />
    </div>
  )
}
