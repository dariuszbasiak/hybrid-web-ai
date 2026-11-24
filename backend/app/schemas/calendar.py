from datetime import date
from pydantic import BaseModel


class CalendarEvent(BaseModel):
    id: str
    date: date
    weekDay: str
    startTime: str
    endTime: str
    title: str
    location: str | None = None


class CalendarEventsResponse(BaseModel):
    startDate: date
    endDate: date
    events: list[CalendarEvent]
