from fastapi.testclient import TestClient

from faios_ai_orchestrator.main import app


def test_speech_transcription_boundary_reports_unconfigured_provider() -> None:
    response = TestClient(app).post(
        "/internal/v1/speech/transcriptions",
        json={
            "audioBase64": "dGVzdA==",
            "mimeType": "audio/webm",
            "language": "en-US",
            "correlationId": "corr_speech_test",
        },
    )

    assert response.status_code == 501
    assert response.json()["detail"]["code"] == "SPEECH_PROVIDER_NOT_CONFIGURED"
    assert response.json()["detail"]["correlationId"] == "corr_speech_test"
