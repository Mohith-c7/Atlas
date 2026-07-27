from __future__ import annotations

import os
from dataclasses import dataclass


def _get_int(name: str, default: int) -> int:
    raw_value = os.getenv(name)
    if raw_value is None:
        return default

    try:
        return int(raw_value)
    except ValueError:
        return default


def _get_float(name: str, default: float) -> float:
    raw_value = os.getenv(name)
    if raw_value is None:
        return default

    try:
        return float(raw_value)
    except ValueError:
        return default


def _get_csv(name: str, default: tuple[str, ...]) -> tuple[str, ...]:
    raw_value = os.getenv(name)
    if raw_value is None:
        return default

    values = tuple(value.strip() for value in raw_value.split(",") if value.strip())
    return values or default


@dataclass(frozen=True)
class PlannerModelSettings:
    primary_provider: str
    fallback_order: tuple[str, ...]
    timeout_seconds: float
    max_retries: int
    repair_attempts: int
    openai_model: str
    anthropic_model: str
    gemini_model: str
    openai_api_key: str | None
    anthropic_api_key: str | None
    gemini_api_key: str | None


@dataclass(frozen=True)
class AppSettings:
    planner: PlannerModelSettings


def get_settings() -> AppSettings:
    primary_provider = os.getenv("PLANNER_PRIMARY_PROVIDER", "deterministic").strip()
    fallback_order = _get_csv("PLANNER_FALLBACK_PROVIDERS", ("deterministic",))

    if primary_provider and primary_provider not in fallback_order:
        fallback_order = (primary_provider, *fallback_order)

    return AppSettings(
        planner=PlannerModelSettings(
            primary_provider=primary_provider,
            fallback_order=fallback_order,
            timeout_seconds=_get_float("PLANNER_MODEL_TIMEOUT_SECONDS", 15.0),
            max_retries=_get_int("PLANNER_MODEL_MAX_RETRIES", 1),
            repair_attempts=_get_int("PLANNER_MODEL_REPAIR_ATTEMPTS", 1),
            openai_model=os.getenv("OPENAI_PLANNER_MODEL", "gpt-4.1-mini"),
            anthropic_model=os.getenv("ANTHROPIC_PLANNER_MODEL", "claude-3-5-sonnet-latest"),
            gemini_model=os.getenv("GEMINI_PLANNER_MODEL", "gemini-2.0-flash"),
            openai_api_key=os.getenv("OPENAI_API_KEY"),
            anthropic_api_key=os.getenv("ANTHROPIC_API_KEY"),
            gemini_api_key=os.getenv("GEMINI_API_KEY"),
        )
    )
