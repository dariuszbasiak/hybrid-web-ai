import type React from "react"
import { ArrowUp, Square } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"

interface ChatInputBarProps {
  input: string
  isGenerating: boolean
  onInputChange: (value: string) => void
  onSend: () => void
  onStop: () => void
}

export function ChatInputBar({
  input,
  isGenerating,
  onInputChange,
  onSend,
  onStop,
}: ChatInputBarProps) {
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    onSend()
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault()
      onSend()
    }
  }

  return (
    <footer className="border-border shrink-0 border-t p-4">
      <form
        onSubmit={handleSubmit}
        className="mx-auto flex w-full max-w-3xl items-end gap-2"
      >
        <Textarea
          value={input}
          onChange={(e) => onInputChange(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Message AI..."
          rows={1}
          className="max-h-40 min-h-11 resize-none"
        />
        {isGenerating ? (
          <Button
            type="button"
            size="icon"
            variant="secondary"
            onClick={onStop}
            aria-label="Stop generating"
          >
            <Square className="size-4" />
          </Button>
        ) : (
          <Button
            type="submit"
            size="icon"
            disabled={!input.trim()}
            aria-label="Send message"
          >
            <ArrowUp className="size-4" />
          </Button>
        )}
      </form>
    </footer>
  )
}
