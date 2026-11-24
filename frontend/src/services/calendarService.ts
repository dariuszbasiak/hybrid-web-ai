import type { CalendarEvent } from "@/types/chat"

export type RelativeDatePeriod =
  | "today"
  | "yesterday"
  | "tomorrow"
  | "this_week"
  | "next_week"

function formatLocalIsoDate(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, "0")
  const day = String(date.getDate()).padStart(2, "0")
  return `${year}-${month}-${day}`
}

function addDays(date: Date, days: number): Date {
  const next = new Date(date.getFullYear(), date.getMonth(), date.getDate())
  next.setDate(next.getDate() + days)
  return next
}

export function resolveRelativeDateRange(
  period: string,
  referenceDate: Date = new Date()
): { period: RelativeDatePeriod; startDate: string; endDate: string } {
  const normalized = period
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_") as RelativeDatePeriod

  const base = new Date(
    referenceDate.getFullYear(),
    referenceDate.getMonth(),
    referenceDate.getDate()
  )

  if (normalized === "yesterday") {
    const d = formatLocalIsoDate(addDays(base, -1))
    return { period: "yesterday", startDate: d, endDate: d }
  }

  if (normalized === "tomorrow") {
    const d = formatLocalIsoDate(addDays(base, 1))
    return { period: "tomorrow", startDate: d, endDate: d }
  }

  if (normalized === "this_week" || normalized === "next_week") {
    // ISO week: Monday (0) .. Sunday (6)
    const offsetFromMonday = (base.getDay() + 6) % 7
    const thisMonday = addDays(base, -offsetFromMonday)
    const monday =
      normalized === "next_week" ? addDays(thisMonday, 7) : thisMonday
    const sunday = addDays(monday, 6)
    return {
      period: normalized,
      startDate: formatLocalIsoDate(monday),
      endDate: formatLocalIsoDate(sunday),
    }
  }

  const today = formatLocalIsoDate(base)
  return { period: "today", startDate: today, endDate: today }
}

export async function getCalendarEvents(
  startDate?: string,
  endDate?: string
): Promise<{ startDate: string; endDate: string; events: CalendarEvent[] }> {
  const start = (startDate ?? "").slice(0, 10)
  const end = (endDate ?? "").slice(0, 10)
  const params = new URLSearchParams({ startDate: start, endDate: end })
  const response = await fetch(`/api/calendar/events?${params.toString()}`)

  if (!response.ok) {
    throw new Error(`Calendar API error: ${response.status} ${response.statusText}`)
  }

  const data = (await response.json()) as {
    startDate: string
    endDate: string
    events: CalendarEvent[]
  }
  console.log(`Loaded calendar events between ${start} and ${end}`, data.events)
  return data
}

export function formatCalendarEventsSummary(
  startDate?: string,
  endDate?: string,
  events: CalendarEvent[] = []
): string {
  if (events.length === 0) {
    return `No calendar events found between ${startDate} and ${endDate}.`
  }
  const lines = events.map(
    (e) =>
      `- ${e.date} (${e.weekDay}) ${e.startTime}–${e.endTime}: ${e.title}${e.location ? ` (${e.location})` : ""}`
  )
  return `Calendar events (${startDate} to ${endDate}):\n${lines.join("\n")}`
}
