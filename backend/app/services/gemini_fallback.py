from collections.abc import AsyncIterator
from datetime import date
import json
import logging
from typing import Any

import httpx

from app.config import Settings
from app.schemas.fallback import FallbackRequest

logger = logging.getLogger(__name__)

GEMINI_API_BASE = "https://generativelanguage.googleapis.com/v1beta/models"


class FallbackServiceError(Exception):
    def __init__(self, message: str, status_code: int = 502) -> None:
        super().__init__(message)
        self.message = message
        self.status_code = status_code


def format_sse_event(event: str, data: dict[str, Any]) -> str:
    return f"event: {event}\ndata: {json.dumps(data)}\n\n"


def _build_system_instruction(request: FallbackRequest) -> str:
    lines = [
        f"Today's date is {date.today().isoformat()}.",
        "You are a capable cloud AI assistant seamlessly handling a request that was escalated from a lightweight on-device model.",
        "Respond directly, helpfully, and thoroughly to the user's request.",
        "Do not mention internal escalation mechanics, tool names, or that you are a fallback unless the user explicitly asks.",
    ]
    if request.reason:
        lines.append(
            f"Internal escalation context (do not quote verbatim): {request.reason}"
        )
    if request.toolContext:
        lines.append(
            "Relevant local tool output already gathered for this turn:\n"
            f"{request.toolContext}"
        )
    return "\n".join(lines)


def _build_gemini_payload(
    request: FallbackRequest, *, include_google_search: bool
) -> dict[str, Any]:
    contents: list[dict[str, Any]] = []
    for msg in request.history:
        text = msg.content.strip()
        if not text:
            continue
        contents.append(
            {
                "role": "model" if msg.role == "assistant" else "user",
                "parts": [{"text": text}],
            }
        )

    contents.append(
        {
            "role": "user",
            "parts": [{"text": request.prompt}],
        }
    )

    payload: dict[str, Any] = {
        "system_instruction": {
            "parts": [{"text": _build_system_instruction(request)}]
        },
        "contents": contents,
    }

    if include_google_search:
        payload["tools"] = [{"google_search": {}}]

    return payload


def _extract_error_message(body: bytes, fallback: str) -> str:
    try:
        parsed = json.loads(body.decode("utf-8", errors="replace"))
        if isinstance(parsed, dict):
            err = parsed.get("error")
            if isinstance(err, dict) and isinstance(err.get("message"), str):
                return err["message"]
    except (ValueError, UnicodeDecodeError):
        pass
    return fallback


def _extract_text_from_chunk(chunk_json: dict[str, Any]) -> str:
    candidates = chunk_json.get("candidates")
    if not isinstance(candidates, list) or not candidates:
        return ""

    content = candidates[0].get("content")
    if not isinstance(content, dict):
        return ""

    parts = content.get("parts")
    if not isinstance(parts, list):
        return ""

    texts: list[str] = []
    for part in parts:
        if isinstance(part, dict) and isinstance(part.get("text"), str):
            texts.append(part["text"])
    return "".join(texts)


def _extract_usage_from_chunk(chunk_json: dict[str, Any]) -> dict[str, int] | None:
    usage = chunk_json.get("usageMetadata")
    if not isinstance(usage, dict):
        return None

    input_tokens = usage.get("promptTokenCount")
    output_tokens = usage.get("candidatesTokenCount")
    total_tokens = usage.get("totalTokenCount")

    if not any(
        isinstance(v, int) for v in (input_tokens, output_tokens, total_tokens)
    ):
        return None

    resolved_input = input_tokens if isinstance(input_tokens, int) else 0
    resolved_output = output_tokens if isinstance(output_tokens, int) else 0
    resolved_total = (
        total_tokens
        if isinstance(total_tokens, int)
        else resolved_input + resolved_output
    )
    return {
        "inputTokens": resolved_input,
        "outputTokens": resolved_output,
        "totalTokens": resolved_total,
    }


async def _iter_gemini_stream_chunks(
    client: httpx.AsyncClient,
    url: str,
    headers: dict[str, str],
    payload: dict[str, Any],
) -> AsyncIterator[tuple[str, dict[str, int] | None]]:
    async with client.stream("POST", url, headers=headers, json=payload) as response:
        if response.status_code >= 400:
            body = await response.aread()
            message = _extract_error_message(
                body,
                f"Gemini API returned HTTP {response.status_code}.",
            )
            raise FallbackServiceError(message=message, status_code=response.status_code)

        async for line in response.aiter_lines():
            if not line or not line.startswith("data:"):
                continue

            raw_data = line[5:].strip()
            if not raw_data or raw_data == "[DONE]":
                continue

            try:
                parsed = json.loads(raw_data)
            except json.JSONDecodeError:
                logger.debug("Skipping non-JSON SSE line from Gemini: %s", raw_data)
                continue

            text = _extract_text_from_chunk(parsed)
            usage = _extract_usage_from_chunk(parsed)
            if text or usage is not None:
                yield text, usage


async def stream_gemini_fallback(
    request: FallbackRequest,
    settings: Settings,
) -> AsyncIterator[str]:
    if not settings.gemini_api_key.strip():
        raise FallbackServiceError(
            "Cloud fallback is not configured. Set GEMINI_API_KEY in backend/.env.",
            status_code=503,
        )

    url = (
        f"{GEMINI_API_BASE}/{settings.gemini_model}:streamGenerateContent"
        "?alt=sse"
    )
    headers = {
        "Content-Type": "application/json",
        "x-goog-api-key": settings.gemini_api_key.strip(),
    }

    yield format_sse_event(
        "meta",
        {
            "provider": "gemini",
            "model": settings.gemini_model,
        },
    )

    latest_usage: dict[str, int] | None = None
    timeout = httpx.Timeout(connect=15.0, read=120.0, write=30.0, pool=15.0)
    async with httpx.AsyncClient(timeout=timeout) as client:
        use_search = settings.gemini_enable_google_search
        payload = _build_gemini_payload(request, include_google_search=use_search)

        try:
            async for delta, usage in _iter_gemini_stream_chunks(
                client, url, headers, payload
            ):
                if delta:
                    yield format_sse_event("delta", {"text": delta})
                if usage is not None:
                    latest_usage = usage
        except FallbackServiceError as exc:
            if use_search and exc.status_code == 400:
                logger.warning(
                    "Gemini request failed with Google Search tool enabled (%s); retrying without search.",
                    exc.message,
                )
                retry_payload = _build_gemini_payload(
                    request, include_google_search=False
                )
                try:
                    async for delta, usage in _iter_gemini_stream_chunks(
                        client, url, headers, retry_payload
                    ):
                        if delta:
                            yield format_sse_event("delta", {"text": delta})
                        if usage is not None:
                            latest_usage = usage
                except FallbackServiceError as retry_exc:
                    yield format_sse_event("error", {"message": retry_exc.message})
                    return
            else:
                yield format_sse_event("error", {"message": exc.message})
                return
        except httpx.HTTPError as exc:
            logger.exception("Network error while calling Gemini API")
            yield format_sse_event(
                "error",
                {"message": f"Failed to reach Gemini API: {exc}"},
            )
            return

    if latest_usage is not None:
        yield format_sse_event("usage", latest_usage)

    yield format_sse_event("done", {})
