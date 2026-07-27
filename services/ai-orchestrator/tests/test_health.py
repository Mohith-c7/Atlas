from fastapi.testclient import TestClient

from faios_ai_orchestrator.main import app


def test_ai_orchestrator_health_endpoints() -> None:
    client = TestClient(app)

    live = client.get("/health/live")
    ready = client.get("/health/ready")

    assert live.status_code == 200
    assert ready.status_code == 200
    assert live.json()["service"] == "ai-orchestrator"
    assert ready.json()["status"] == "ok"
