import { useEffect, useRef } from "react"
import { Bot, Cloud, Wrench } from "lucide-react"

import { ChatEmptyState } from "@/components/chat/ChatEmptyState"
import { ChatMessageItem } from "@/components/chat/ChatMessageItem"
import { ScrollArea } from "@/components/ui/scroll-area"
import type { ActiveToolCall, ChatMessage, FallbackState } from "@/types/chat"

interface ChatMessageListProps {
  messages: ChatMessage[]
  isGenerating: boolean
  activeToolCalls?: ActiveToolCall[]
  fallbackState?: FallbackState | null
  onSelectPrompt: (prompt: string) => void
}

function formatToolArgs(args: Record<string, unknown>): string {
  const entries = Object.entries(args)
  if (entries.length === 0) return ""
  return entries
    .map(([key, value]) => `${key}: ${String(value)}`)
    .join(", ")
}

export function ChatMessageList({
  messages,
  isGenerating,
  activeToolCalls = [],
  fallbackState = null,
  onSelectPrompt,
}: ChatMessageListProps) {
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages, isGenerating, activeToolCalls, fallbackState])

  const hasStreamingReply =
    messages.length > 0 && messages[messages.length - 1].role === "assistant"

  return (
    <ScrollArea className="min-h-0 flex-1">
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-6">
        {messages.length === 0 ? (
          <ChatEmptyState onSelectPrompt={onSelectPrompt} />
        ) : (
          messages.map((message) => (
            <ChatMessageItem key={message.id} message={message} />
          ))
        )}

        {isGenerating && !hasStreamingReply && (
          <div className="flex items-start gap-3">
            <div className="bg-muted text-muted-foreground flex size-8 shrink-0 items-center justify-center rounded-full border">
              {fallbackState ? (
                <Cloud className="size-4" />
              ) : (
                <Bot className="size-4" />
              )}
            </div>
            <div className="flex flex-col gap-1.5">
              <div className="bg-muted text-muted-foreground rounded-2xl px-4 py-2.5 text-sm">
                {fallbackState
                  ? fallbackState.model
                    ? `Continuing with ${fallbackState.model}...`
                    : "Continuing with cloud model..."
                  : "Thinking..."}
              </div>
              {activeToolCalls.length > 0 && (
                <div className="flex flex-col gap-1 pl-1">
                  {activeToolCalls.map((call, idx) => {
                    const argsText = formatToolArgs(call.arguments)
                    return (
                      <div
                        key={`${call.name}-${idx}`}
                        className="text-muted-foreground flex items-center gap-1.5 text-xs"
                      >
                        <Wrench className="size-3 shrink-0" />
                        <span>
                          Calling{" "}
                          <code className="bg-muted rounded px-1 py-0.5 font-mono text-[11px]">
                            {call.name}
                          </code>
                          {argsText ? ` (${argsText})` : ""}
                        </span>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </div>
        )}

        <div ref={bottomRef} />
      </div>
    </ScrollArea>
  )
}
