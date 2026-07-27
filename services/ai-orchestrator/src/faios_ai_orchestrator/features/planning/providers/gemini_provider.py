from typing import Any

from faios_ai_orchestrator.features.planning.providers.base import BasePlannerProvider

try:
    from google import genai
except ImportError:  # pragma: no cover - optional dependency boundary
    genai = None  # type: ignore[assignment]


class GeminiPlannerProvider(BasePlannerProvider):
    provider = "gemini"

    def __init__(
        self,
        *,
        model: str = "gemini-2.5-pro",
        api_key: str | None = None,
        client: Any | None = None,
        timeout_seconds: float | None = None,
    ) -> None:
        super().__init__(
            model=model,
            api_key=api_key,
            client=client,
            timeout_seconds=timeout_seconds,
        )
        self.sdk_client = (
            genai.Client(api_key=api_key) if client is None and api_key and genai else None
        )

    def provider_label(self) -> str:
        return "Gemini"
