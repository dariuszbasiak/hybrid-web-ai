from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse

from app.config import Settings, get_settings
from app.schemas.fallback import FallbackRequest
from app.services.gemini_fallback import stream_gemini_fallback

router = APIRouter(prefix="/api/fallback", tags=["fallback"])


@router.post("/chat")
async def fallback_chat(
    request: FallbackRequest,
    settings: Settings = Depends(get_settings),
) -> StreamingResponse:
    if not settings.gemini_api_key.strip():
        raise HTTPException(
            status_code=503,
            detail="Cloud fallback is not configured. Set GEMINI_API_KEY in backend/.env.",
        )

    return StreamingResponse(
        stream_gemini_fallback(request, settings),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )
