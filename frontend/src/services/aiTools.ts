import {
  formatCalendarEventsSummary,
  getCalendarEvents,
  resolveRelativeDateRange,
} from "@/services/calendarService"
import type { CalendarEvent, LanguageModelTool } from "@/types/chat"

export const MODEL_TOOLS: LanguageModelTool<any>[] = [
  {
    name: "resolve_date_range",
    description:
      "Convert a relative date period ('today', 'yesterday', 'tomorrow', 'this_week', 'next_week') into ISO 8601 startDate and endDate (YYYY-MM-DD) to pass to check_callendar.",
    inputSchema: {
      type: "object",
      properties: {
        period: {
          type: "string",
          enum: ["today", "yesterday", "tomorrow", "this_week", "next_week"],
          description: "Relative date period to resolve into a date range.",
        },
      },
      required: ["period"],
    },
    execute: async ({ period }: { period: string }) => {
      const range = resolveRelativeDateRange(period)
      console.log(`Resolved relative period "${period}" ->`, range)
      return JSON.stringify(range)
    },
  },
  {
    name: "check_callendar",
    description: "Check calendar events between a startDate and an endDate.",
    inputSchema: {
      type: "object",
      properties: {
        startDate: {
          type: "string",
          description: "Start date in ISO 8601 format (YYYY-MM-DD).",
        },
        endDate: {
          type: "string",
          description: "End date in ISO 8601 format (YYYY-MM-DD).",
        },
      },
      required: ["startDate", "endDate"],
    },
    execute: async ({
      startDate,
      endDate,
    }: {
      startDate: string
      endDate: string
    }) => {
      return JSON.stringify(await getCalendarEvents(startDate, endDate))
    },
  },
  {
    name: "too_complex",
    description:
      `Escalate the request to a more capable model. Call this tool instead of replying whenever the user asks for web search, live or external data, reports across external sources/institutions, deep multi-step research, or any task beyond a lightweight local model's capabilities.
      `,
    inputSchema: {
      type: "object",
      properties: {
        reason: {
          type: "string",
          description: "Why the request is too complex for the local model.",
        },
      },
      required: ["reason"],
    },
    execute: async ({ reason }: { reason: string }) => {
      console.warn(` Escalation requested: ${reason}`)
      return JSON.stringify({
        escalated: true,
        reason,
      })
    },
  },
]

export function formatToolResultsFallback(
  toolResults: Array<{ name: string; result: string }>
): string {
  return toolResults
    .map(({ name, result }) => {
      try {
        const parsed = JSON.parse(result) as {
          startDate?: string
          endDate?: string
          events?: CalendarEvent[]
          escalated?: boolean
          reason?: string
        }
        if (name === "check_callendar" && Array.isArray(parsed.events)) {
          return formatCalendarEventsSummary(
            parsed.startDate,
            parsed.endDate,
            parsed.events
          )
        }
        if (name === "resolve_date_range" && parsed.startDate && parsed.endDate) {
          return `Resolved date range: ${parsed.startDate} to ${parsed.endDate}`
        }
        if (name === "too_complex" && parsed.escalated) {
          return `Request escalated: ${parsed.reason ?? "Too complex for local model."}`
        }
      } catch {
        // Ignore JSON parse errors and return raw result.
      }
      return `[${name}] ${result}`
    })
    .join("\n\n")
}
