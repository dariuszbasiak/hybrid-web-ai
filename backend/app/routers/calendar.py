from datetime import date
from fastapi import APIRouter, Query

from app.data.calendar_mock import MOCK_CALENDAR_EVENTS
from app.schemas.calendar import CalendarEventsResponse

router = APIRouter(prefix="/api/calendar", tags=["calendar"])


@router.get("/events", response_model=CalendarEventsResponse)
def get_calendar_events(
    startDate: date = Query(..., description="Start date in YYYY-MM-DD format"),
    endDate: date = Query(..., description="End date in YYYY-MM-DD format"),
) -> CalendarEventsResponse:
    events = [
        evt
        for evt in MOCK_CALENDAR_EVENTS
        if startDate <= evt.date <= endDate
    ]
    return CalendarEventsResponse(
        startDate=startDate,
        endDate=endDate,
        events=events,
    )
