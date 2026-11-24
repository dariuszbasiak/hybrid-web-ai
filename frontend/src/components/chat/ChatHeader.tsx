import { Bot, Cloud, Plus, Sprout, Sun } from "lucide-react"

import { HeaderVibeCanvas } from "@/components/chat/HeaderVibeCanvas"
import { Button } from "@/components/ui/button"
import type { HeaderVibeState, TokenUsageSummary } from "@/types/chat"

interface ChatHeaderProps {
  onNewChat: () => void
  canReset: boolean
  error: string | null
  statusMessage: string | null
  vibeState: HeaderVibeState
  tokenUsage: TokenUsageSummary
}

export function ChatHeader({
  onNewChat,
  canReset,
  error,
  statusMessage,
  vibeState,
  tokenUsage,
}: ChatHeaderProps) {
  const tokenTooltip = [
    `Local model: ${tokenUsage.local.toLocaleString()} tokens`,
    `Cloud model: ${tokenUsage.cloud.toLocaleString()} tokens (in: ${tokenUsage.cloudInput.toLocaleString()}, out: ${tokenUsage.cloudOutput.toLocaleString()})`,
  ].join("\n")

  return (
    <>
      <header className="border-border relative flex h-[155px] shrink-0 flex-col justify-between overflow-hidden border-b px-5 py-3.5 text-white">
        <HeaderVibeCanvas vibeState={vibeState} />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 bg-gradient-to-b from-slate-950/30 via-slate-950/5 to-slate-950/40"
        />

        <div className="relative z-10 flex items-center justify-between">
          <div className="flex items-center gap-2.5 rounded-full bg-slate-950/30 px-3.5 py-1.5 backdrop-blur-md ring-1 ring-white/20">
            <Bot className="size-4 text-white/90" />
            <span className="text-sm font-semibold tracking-tight">AI Chat</span>
          </div>

          <Button
            variant="ghost"
            size="sm"
            onClick={onNewChat}
            disabled={!canReset}
            className="rounded-full bg-slate-950/30 text-white backdrop-blur-md ring-1 ring-white/20 hover:bg-slate-950/50 hover:text-white disabled:opacity-45"
          >
            <Plus className="size-4" />
            New chat
          </Button>
        </div>

        <div className="relative z-10 flex flex-wrap items-center justify-between gap-2">
          <div className="inline-flex items-center gap-2 rounded-full bg-slate-950/35 px-3 py-1 text-xs font-medium backdrop-blur-md ring-1 ring-white/20">
            {vibeState === "cloud" ? (
              <>
                <Cloud className="size-3.5 text-sky-200" />
                <span>Soaring in Cloud · Gemini API</span>
              </>
            ) : vibeState === "local" ? (
              <>
                <Sprout className="size-3.5 text-emerald-200" />
                <span>Cruising Local · On-Device Model</span>
              </>
            ) : (
              <>
                <Sun className="size-3.5 text-amber-200" />
                <span>Ready · Hybrid AI</span>
              </>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div
              title={tokenTooltip}
              className="inline-flex items-center gap-2.5 rounded-full bg-slate-950/35 px-3 py-1 text-[11px] font-medium text-white/95 tabular-nums backdrop-blur-md ring-1 ring-white/20"
            >
              <span className="inline-flex items-center gap-1">
                <Sprout className="size-3 text-emerald-200" />
                <span>Local: {tokenUsage.local.toLocaleString()}</span>
              </span>
              <span className="text-white/40">|</span>
              <span className="inline-flex items-center gap-1">
                <Cloud className="size-3 text-sky-200" />
                <span>Cloud: {tokenUsage.cloud.toLocaleString()}</span>
              </span>
              <span className="text-white/65">tok</span>
            </div>

            {statusMessage && (
              <span className="rounded-full bg-slate-950/30 px-2.5 py-1 text-[11px] text-white/90 backdrop-blur-md ring-1 ring-white/15">
                {statusMessage}
              </span>
            )}
          </div>
        </div>
      </header>

      {error && (
        <p className="border-border bg-destructive/10 text-destructive border-b px-4 py-1.5 text-center text-xs">
          {error}
        </p>
      )}
    </>
  )
}
