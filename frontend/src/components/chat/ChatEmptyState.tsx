import { Button } from "@/components/ui/button"

const STARTER_PROMPTS = [
  "Explain how WebGPU works in the browser",
  "Draft a concise system prompt for a code assistant",
  "Compare local vs. cloud inference trade-offs",
]

interface ChatEmptyStateProps {
  onSelectPrompt: (prompt: string) => void
  prompts?: string[]
}

export function ChatEmptyState({
  onSelectPrompt,
  prompts = STARTER_PROMPTS,
}: ChatEmptyStateProps) {
  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center gap-6 text-center">
      <div className="space-y-1.5">
        <h1 className="text-xl font-semibold tracking-tight">
          How can I help today?
        </h1>
        <p className="text-muted-foreground text-sm">
          Start a conversation or pick a prompt below.
        </p>
      </div>
      <div className="flex flex-wrap justify-center gap-2">
        {prompts.map((prompt) => (
          <Button
            key={prompt}
            variant="outline"
            size="sm"
            onClick={() => onSelectPrompt(prompt)}
          >
            {prompt}
          </Button>
        ))}
      </div>
    </div>
  )
}
