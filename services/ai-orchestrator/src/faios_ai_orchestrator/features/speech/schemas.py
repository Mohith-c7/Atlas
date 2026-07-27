from typing import Annotated

from pydantic import BaseModel, ConfigDict, Field


NonEmptyString = Annotated[str, Field(min_length=1)]


class CamelModel(BaseModel):
    model_config = ConfigDict(extra="forbid", populate_by_name=True)


class VoiceTranscriptionRequest(CamelModel):
    audio_base64: NonEmptyString = Field(alias="audioBase64")
    mime_type: NonEmptyString = Field(alias="mimeType")
    language: str | None = None
    correlation_id: NonEmptyString = Field(alias="correlationId")


class VoiceTranscriptionResponse(CamelModel):
    transcript: NonEmptyString
    confidence: float | None = None
    correlation_id: NonEmptyString = Field(alias="correlationId")
