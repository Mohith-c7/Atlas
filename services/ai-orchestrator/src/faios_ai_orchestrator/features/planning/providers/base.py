from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from typing import Literal, Mapping, Protocol

from faios_ai_orchestrator.features.planning.schemas import PlanRequest


ProviderName = Literal["openai", "anthropic", "gemini"]


class ModelProviderError(RuntimeError):
    """Stable error raised when a provider cannot produce a candidate safely."""

    def __init__(self, provider: ProviderName, message: str) -> None:
        super().__init__(message)
        self.provider = provider


@dataclass(frozen=True, slots=True)
class ModelProviderRequest:
    provider: ProviderName
    model: str
    plan_request: PlanRequest
    system_prompt: str
    response_schema_name: str = "PlanResponse"
    timeout_seconds: float | None = None
    metadata: Mapping[str, str] = field(default_factory=dict)


@dataclass(frozen=True, slots=True)
class ModelProviderResponse:
    provider: ProviderName
    model: str
    candidate: dict[str, object]
    finish_reason: str | None = None
    usage: Mapping[str, int] = field(default_factory=dict)
    raw_response_id: str | None = None


class AsyncCandidateClient(Protocol):
    async def create_plan_candidate(
        self, request: ModelProviderRequest
    ) -> ModelProviderResponse | dict[str, object] | None:
        """Return a structured candidate without exposing provider SDK details."""


class BasePlannerProvider(ABC):
    provider: ProviderName

    def __init__(
        self,
        *,
        model: str,
        api_key: str | None = None,
        client: AsyncCandidateClient | None = None,
        timeout_seconds: float | None = None,
    ) -> None:
        self.model = model
        self.api_key = api_key
        self.client = client
        self.timeout_seconds = timeout_seconds

    @property
    def is_configured(self) -> bool:
        return self.client is not None or bool(self.api_key)

    async def create_plan_candidate(
        self, plan_request: PlanRequest, *, system_prompt: str = ""
    ) -> dict[str, object] | None:
        if self.client is None:
            return None

        response = await self.client.create_plan_candidate(
            ModelProviderRequest(
                provider=self.provider,
                model=self.model,
                plan_request=plan_request,
                system_prompt=system_prompt,
                timeout_seconds=self.timeout_seconds,
            )
        )
        return self._normalize_client_response(response)

    def _normalize_client_response(
        self, response: ModelProviderResponse | dict[str, object] | None
    ) -> dict[str, object] | None:
        if response is None:
            return None
        if isinstance(response, ModelProviderResponse):
            return response.candidate
        return response

    @abstractmethod
    def provider_label(self) -> str:
        """Human-readable provider label for logs, traces, and diagnostics."""
