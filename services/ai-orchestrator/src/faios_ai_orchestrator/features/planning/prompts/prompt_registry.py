from __future__ import annotations

from dataclasses import dataclass
from functools import lru_cache
from importlib import resources


@dataclass(frozen=True)
class PromptTemplate:
    name: str
    version: str
    text: str


class PromptNotFoundError(ValueError):
    pass


_PROMPT_FILES: dict[str, tuple[str, str]] = {
    "planner:v1": ("planner_v1.md", "v1"),
}


@lru_cache(maxsize=16)
def get_prompt(name: str) -> PromptTemplate:
    prompt_file = _PROMPT_FILES.get(name)
    if prompt_file is None:
        raise PromptNotFoundError(f"Unknown planning prompt: {name}")

    filename, version = prompt_file
    package = __package__ or "faios_ai_orchestrator.features.planning.prompts"
    text = resources.files(package).joinpath(filename).read_text(encoding="utf-8")
    return PromptTemplate(name=name, version=version, text=text)


def get_planner_prompt() -> PromptTemplate:
    return get_prompt("planner:v1")
