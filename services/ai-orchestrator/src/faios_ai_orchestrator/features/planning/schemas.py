from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field


NonEmptyString = Annotated[str, Field(min_length=1)]


class CamelModel(BaseModel):
    model_config = ConfigDict(extra="forbid", populate_by_name=True)


class PlanRequest(CamelModel):
    command_id: NonEmptyString = Field(alias="commandId")
    founder_id: NonEmptyString = Field(alias="founderId")
    conversation_id: NonEmptyString | None = Field(default=None, alias="conversationId")
    source: Literal["voice", "chat"]
    input: NonEmptyString
    correlation_id: NonEmptyString = Field(alias="correlationId")
    available_capabilities: list["AvailableCapability"] = Field(
        default_factory=list, alias="availableCapabilities"
    )
    memory_context: list["MemoryContextItem"] = Field(default_factory=list, alias="memoryContext")


class PlanStep(CamelModel):
    capability: NonEmptyString
    provider: str | None = None
    requires_approval: bool = Field(alias="requiresApproval")
    reason: NonEmptyString
    execution_payload: dict[str, object] | None = Field(default=None, alias="executionPayload")


class PlanResponse(CamelModel):
    command_id: NonEmptyString = Field(alias="commandId")
    status: Literal["completed", "awaiting_approval", "failed"]
    summary: NonEmptyString
    steps: list[PlanStep]
    steps_capability_context: list["AvailableCapability"] = Field(
        default_factory=list, exclude=True
    )


class AvailableCapability(CamelModel):
    key: NonEmptyString
    provider: NonEmptyString
    label: NonEmptyString
    description: NonEmptyString
    requires_approval: bool = Field(alias="requiresApproval")
    status: Literal["available", "not_connected", "disabled"]


class MemoryContextItem(CamelModel):
    id: NonEmptyString
    kind: Literal[
        "founder_profile",
        "company_fact",
        "preference",
        "decision",
        "contact",
        "workflow_pattern",
        "summary",
    ]
    content: NonEmptyString
    source: str | None = None
    confidence: float | None = None
    created_at: NonEmptyString = Field(alias="createdAt")
