from fastapi import APIRouter, HTTPException

from faios_ai_orchestrator.features.speech.schemas import (
    VoiceTranscriptionRequest,
    VoiceTranscriptionResponse,
)


router = APIRouter(prefix="/internal/v1/speech", tags=["speech"])


@router.post("/transcriptions", response_model=VoiceTranscriptionResponse)
async def transcribe_voice(request: VoiceTranscriptionRequest) -> VoiceTranscriptionResponse:
    raise HTTPException(
        status_code=501,
        detail={
            "code": "SPEECH_PROVIDER_NOT_CONFIGURED",
            "message": "Speech transcription provider is not configured yet.",
            "correlationId": request.correlation_id,
        },
    )
