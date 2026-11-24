from typing import Literal

from pydantic import BaseModel, Field


class FallbackMessage(BaseModel):
    role: Literal["user", "assistant"]
    content: str


class FallbackRequest(BaseModel):
    prompt: str = Field(..., min_length=1, description="The user's latest prompt.")
    history: list[FallbackMessage] = Field(
        default_factory=list,
        description="Previous conversation turns prior to the latest prompt.",
    )
    reason: str | None = Field(
        default=None,
        description="Reason reported by the local model for escalating the request.",
    )
    toolContext: str | None = Field(
        default=None,
        description="Optional context from local tool calls already executed in this turn.",
    )
