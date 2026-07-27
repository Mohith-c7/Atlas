from datetime import UTC, datetime

from fastapi import APIRouter


router = APIRouter(prefix="/health", tags=["health"])


def _health_payload() -> dict[str, object]:
    return {
        "service": "ai-orchestrator",
        "status": "ok",
        "checkedAt": datetime.now(UTC).isoformat(),
        "components": {},
    }


@router.get("/live")
async def live() -> dict[str, object]:
    return _health_payload()


@router.get("/ready")
async def ready() -> dict[str, object]:
    return _health_payload()
