import { Bot, Cloud, User } from "lucide-react"
import ReactMarkdown from "react-markdown"

import { cn } from "@/lib/utils"
import type { ChatMessage } from "@/types/chat"

interface ChatMessageItemProps {
  message: ChatMessage
}

export function ChatMessageItem({ message }: ChatMessageItemProps) {
  const isUser = message.role === "user"

  return (
    <div
      className={cn("flex items-start gap-3", isUser && "flex-row-reverse")}
    >
      <div
        className={cn(
          "flex size-8 shrink-0 items-center justify-center rounded-full border",
          isUser
            ? "bg-primary text-primary-foreground border-primary"
            : "bg-muted text-muted-foreground"
        )}
      >
        {isUser ? <User className="size-4" /> : <Bot className="size-4" />}
      </div>
      <div
        className={cn(
          "flex max-w-[80%] flex-col gap-1",
          isUser && "items-end"
        )}
      >
        <div
          className={cn(
            "rounded-2xl px-4 py-2.5 text-sm leading-relaxed",
            isUser
              ? "bg-primary text-primary-foreground whitespace-pre-wrap"
              : "bg-muted text-foreground"
          )}
        >
          {isUser ? (
            message.content
          ) : (
            <ReactMarkdown
              components={{
                p: ({ children }) => (
                  <p className="mb-2 last:mb-0">{children}</p>
                ),
                ul: ({ children }) => (
                  <ul className="mb-2 list-disc space-y-1 pl-5 last:mb-0">
                    {children}
                  </ul>
                ),
                ol: ({ children }) => (
                  <ol className="mb-2 list-decimal space-y-1 pl-5 last:mb-0">
                    {children}
                  </ol>
                ),
                li: ({ children }) => <li>{children}</li>,
                h1: ({ children }) => (
                  <h1 className="mt-3 mb-1.5 text-base font-semibold first:mt-0">
                    {children}
                  </h1>
                ),
                h2: ({ children }) => (
                  <h2 className="mt-2.5 mb-1 text-sm font-semibold first:mt-0">
                    {children}
                  </h2>
                ),
                h3: ({ children }) => (
                  <h3 className="mt-2 mb-1 text-sm font-medium first:mt-0">
                    {children}
                  </h3>
                ),
                blockquote: ({ children }) => (
                  <blockquote className="border-border text-muted-foreground my-2 border-l-2 pl-3 italic">
                    {children}
                  </blockquote>
                ),
                pre: ({ children }) => (
                  <pre className="bg-background/80 my-2 overflow-x-auto rounded-lg p-3 text-xs">
                    {children}
                  </pre>
                ),
                code: ({ className, children, ...props }) => {
                  const isBlock = Boolean(className)
                  return isBlock ? (
                    <code className={cn("font-mono text-xs", className)} {...props}>
                      {children}
                    </code>
                  ) : (
                    <code
                      className="bg-background/70 rounded px-1 py-0.5 font-mono text-xs"
                      {...props}
                    >
                      {children}
                    </code>
                  )
                },
                a: ({ href, children }) => (
                  <a
                    href={href}
                    target="_blank"
                    rel="noreferrer"
                    className="underline underline-offset-2 hover:opacity-80"
                  >
                    {children}
                  </a>
                ),
              }}
            >
              {message.content}
            </ReactMarkdown>
          )}
        </div>
        {!isUser && message.source === "cloud" && (
          <div
            className="text-muted-foreground flex items-center gap-1 pl-1 text-[11px]"
            title={message.fallbackReason}
          >
            <Cloud className="size-3 shrink-0" />
            <span>
              {message.model ? `Cloud · ${message.model}` : "Cloud model"}
            </span>
          </div>
        )}
      </div>
    </div>
  )
}
