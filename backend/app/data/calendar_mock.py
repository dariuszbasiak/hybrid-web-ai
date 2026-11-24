from datetime import date

from app.schemas.calendar import CalendarEvent

MOCK_CALENDAR_EVENTS: list[CalendarEvent] = [
    CalendarEvent(
        id="evt-1",
        date=date(2026, 11, 15),
        weekDay="Sunday",
        startTime="10:00",
        endTime="11:00",
        title="Weekly Planning & Roadmap Sync",
        location="Google Meet",
    ),
    CalendarEvent(
        id="evt-2",
        date=date(2026, 11, 16),
        weekDay="Monday",
        startTime="09:30",
        endTime="10:00",
        title="Frontend Standup",
        location="Room B / Meet",
    ),
    CalendarEvent(
        id="evt-3",
        date=date(2026, 11, 16),
        weekDay="Monday",
        startTime="14:00",
        endTime="15:00",
        title="Hybrid Web AI Architecture Review",
        location="Design Lab",
    ),
    CalendarEvent(
        id="evt-4",
        date=date(2026, 11, 17),
        weekDay="Tuesday",
        startTime="11:00",
        endTime="12:00",
        title="1:1 with Product Manager",
        location="Coffee Corner",
    ),
    CalendarEvent(
        id="evt-5",
        date=date(2026, 11, 18),
        weekDay="Wednesday",
        startTime="16:00",
        endTime="17:00",
        title="WebGPU & Prompt API Demo",
        location="Main Auditorium",
    ),
    CalendarEvent(
        id="evt-6",
        date=date(2026, 11, 20),
        weekDay="Friday",
        startTime="13:00",
        endTime="13:45",
        title="Dentist Appointment",
        location="Downtown Clinic",
    ),
]
